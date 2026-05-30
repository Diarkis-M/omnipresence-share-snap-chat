#!/usr/bin/env node

/**
 * Full Snapchat Scouting Pipeline Orchestrator — v2.0
 *
 * API-first, zero external dependencies. Uses ONLY:
 *   - Snap Creator Discovery API (post-approval)
 *   - Google Custom Search (pre-API bridge)
 *   - Manual seeds
 *   - Claude Haiku (relevance gate + scoring)
 *
 * Pipeline steps:
 *   1.   DISCOVER — Snap API + Google CSE + manual seeds
 *   2.   VALIDATE — HEAD requests for non-API candidates
 *   2.5  ENRICH   — Scrape public profile pages for real data (subs, bio, Spotlight)
 *   3.   FILTER   — Gates G1→G5
 *   4.   SCORE    — Claude Haiku scoring
 *   5.   OUTPUT   — CSV + JSON reports
 *
 * Usage:
 *   node scripts/run-pipeline.js                         # full pipeline
 *   node scripts/run-pipeline.js --skip-api              # skip Snap API discovery
 *   node scripts/run-pipeline.js --skip-google           # skip Google CSE
 *   node scripts/run-pipeline.js --skip-validate         # skip HEAD validation
 *   node scripts/run-pipeline.js --skip-enrich           # skip profile scraping
 *   node scripts/run-pipeline.js --max-score 20          # limit scoring count
 *   node scripts/run-pipeline.js --brand "Muuchstac"     # set brand context
 *   node scripts/run-pipeline.js --max-per-tier 200      # cap API results per tier
 *   node scripts/run-pipeline.js --mock-api              # use mock data for testing
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { isSnapApiConfigured, discoverCreators, SNAP_SUBSCRIBER_TIERS } from '../src/lib/snap-api-client.js';
import { runGates } from '../src/lib/gates.js';
import { scrapeProfile, mergeEnrichmentIntoCandidate } from './enrich-profiles.js';
import { CircuitBreaker, loadConfigSafe } from '../src/lib/resilience.js';
import { HealthMonitor } from '../src/lib/health-monitor.js';
import { generateDashboard } from './generate-dashboard.js';
import { getActiveModel } from '../src/lib/anthropic.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const CONFIG_DIR = join(ROOT, 'config');
const OUTPUT_DIR = join(ROOT, 'output');

// Parse CLI args
const args = process.argv.slice(2);
const skipApi = args.includes('--skip-api');
const skipGoogle = args.includes('--skip-google');
const skipValidate = args.includes('--skip-validate');
const skipEnrich = args.includes('--skip-enrich');
const useMockApi = args.includes('--mock-api');
const freshRun = args.includes('--fresh');
const maxPerTierArg = args.find((_, i) => args[i - 1] === '--max-per-tier');
const maxPerTier = maxPerTierArg ? parseInt(maxPerTierArg, 10) : 500;

function log(stage, msg) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [${stage}] ${msg}`);
}

function divider(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}\n`);
}

// Ensure directories exist
for (const dir of [DATA_DIR, OUTPUT_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ─── CHECKPOINT ────────────────────────────────────────────

function saveCheckpoint(step, candidateCount) {
  const checkpoint = {
    step,
    candidateCount,
    savedAt: new Date().toISOString(),
    pipelineVersion: '3.0.0',
  };
  writeFileSync(join(DATA_DIR, 'pipeline_checkpoint.json'), JSON.stringify(checkpoint, null, 2));
}

// ─── POST-PIPELINE ─────────────────────────────────────────

function postPipeline(scored, enriched, monitor) {
  // Auto-seed expansion: add high-scoring creators to seeds
  const seedPath = join(CONFIG_DIR, 'seed-creators.json');
  const seedData = loadConfigSafe(seedPath, { seed_creators: [] });
  const existingHandles = new Set(seedData.seed_creators.map(s => s.handle.toLowerCase()));

  let newSeeds = 0;
  for (const c of scored) {
    const handle = (c.username || '').toLowerCase();
    if (handle && (c.subscriberCount || 0) >= 5000 && !existingHandles.has(handle)) {
      seedData.seed_creators.push({
        handle,
        note: `Auto-added: ${c.subscriberCount || '?'} subs. ${new Date().toISOString().split('T')[0]}`,
      });
      existingHandles.add(handle);
      newSeeds++;
    }
  }
  if (newSeeds > 0) {
    writeFileSync(seedPath, JSON.stringify(seedData, null, 2));
    log('POST', `Auto-expanded seeds: +${newSeeds} creators (score ≥ 65)`);
  }

  // Snowball handle collection
  const snowballHandles = new Set();
  for (const c of enriched) {
    if (Array.isArray(c._snowballHandles)) {
      for (const h of c._snowballHandles) {
        if (!existingHandles.has(h)) snowballHandles.add(h);
      }
    }
  }
  if (snowballHandles.size > 0) {
    const snowballPath = join(DATA_DIR, 'snowball_candidates.json');
    writeFileSync(snowballPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      handles: [...snowballHandles],
      count: snowballHandles.size,
    }, null, 2));
    log('POST', `Snowball candidates: ${snowballHandles.size} new handles saved`);
  }

  // Record model info
  monitor.recordModelInfo(getActiveModel());

  // Finalize health report
  const metrics = monitor.finalize();

  // Generate dashboard
  let runHistory = [];
  const historyPath = join(DATA_DIR, 'run_history.json');
  if (existsSync(historyPath)) {
    try { runHistory = JSON.parse(readFileSync(historyPath, 'utf-8')); } catch { runHistory = []; }
  }
  const dashHtml = generateDashboard(metrics, runHistory);
  writeFileSync(join(OUTPUT_DIR, 'health_dashboard.html'), dashHtml);
  log('POST', 'Health dashboard: output/health_dashboard.html');

  // Print warnings
  if (metrics.warnings.length > 0) {
    log('POST', `Warnings (${metrics.warnings.length}):`);
    for (const w of metrics.warnings) {
      log('POST', `  ⚠ ${w}`);
    }
  }
}

// ─── STEP 1: DISCOVER ──────────────────────────────────────

async function stepDiscover() {
  divider('STEP 1: DISCOVER — Find Snapchat Creators');

  const allCreators = new Map();
  let discoveryMode = 'none';

  // Channel A: Snap API Creator Discovery
  if (!skipApi && (isSnapApiConfigured() || useMockApi)) {
    discoveryMode = 'snap_api';

    if (useMockApi) {
      log('DISCOVER', 'Using mock API data for testing');
      const mockPath = join(DATA_DIR, 'mock_api_response.json');
      if (existsSync(mockPath)) {
        const mockData = JSON.parse(readFileSync(mockPath, 'utf-8'));
        const creators = mockData.creators || [];
        for (const c of creators) {
          c.source = 'snap_api';
          c.profileExists = true;
          c.discoveredAt = c.discoveredAt || new Date().toISOString();
          allCreators.set(c.username, c);
        }
        log('DISCOVER', `Loaded ${creators.length} mock API creators`);
      } else {
        log('DISCOVER', 'No mock_api_response.json found — skipping mock');
      }
    } else {
      log('DISCOVER', 'Running Snap API Creator Discovery...');

      // Load grooming keywords for targeted queries
      const kwPath = join(CONFIG_DIR, 'grooming-keywords.json');
      const keywords = existsSync(kwPath)
        ? JSON.parse(readFileSync(kwPath, 'utf-8')).generic_relevance_terms || []
        : ['grooming', 'beard', 'skincare', 'hair', 'perfume', 'fragrance'];

      // Strategy 1: Targeted keyword queries
      log('DISCOVER', `Strategy 1: ${keywords.length} keyword queries`);
      for (let i = 0; i < keywords.length; i++) {
        const keyword = keywords[i];
        try {
          let cursor;
          let pageCount = 0;
          do {
            const result = await discoverCreators({
              countryCodes: ['IN'],
              query: keyword,
              minFollowers: 500,
              limit: 50,
              cursor,
            });
            for (const c of result.creators) {
              if (!allCreators.has(c.username)) allCreators.set(c.username, c);
            }
            cursor = result.nextCursor;
            pageCount++;
            if (cursor) await new Promise(r => setTimeout(r, 1000));
          } while (cursor && pageCount < 4); // max 4 pages per keyword (200 results)

          process.stdout.write(`\r[DISCOVER] Keyword ${i + 1}/${keywords.length}: "${keyword}" → ${allCreators.size} total unique`);
        } catch (err) {
          log('DISCOVER', `Keyword "${keyword}" error: ${err.message}`);
        }
      }
      console.log();

      // Strategy 2: Broad sweep by tier
      log('DISCOVER', 'Strategy 2: Broad sweep by subscriber tier');
      for (const [tierName, range] of Object.entries(SNAP_SUBSCRIBER_TIERS)) {
        const maxFollowers = range.max === Infinity ? undefined : range.max;
        try {
          let cursor;
          let tierCount = 0;
          do {
            const result = await discoverCreators({
              countryCodes: ['IN'],
              minFollowers: range.min,
              maxFollowers: maxFollowers,
              limit: 50,
              cursor,
            });
            for (const c of result.creators) {
              if (!allCreators.has(c.username)) allCreators.set(c.username, c);
            }
            cursor = result.nextCursor;
            tierCount += result.creators.length;
            if (cursor) await new Promise(r => setTimeout(r, 1000));
          } while (cursor && tierCount < maxPerTier);

          log('DISCOVER', `  Tier ${tierName}: ${tierCount} creators (${allCreators.size} total unique)`);
        } catch (err) {
          log('DISCOVER', `  Tier ${tierName} error: ${err.message}`);
        }
      }
    }

    log('DISCOVER', `Snap API: ${allCreators.size} unique creators`);
  } else if (!skipApi) {
    log('DISCOVER', 'Snap API not configured — skipping (set SNAP_CLIENT_ID + SNAP_CLIENT_SECRET)');
  } else {
    log('DISCOVER', 'Snap API discovery skipped (--skip-api)');
  }

  // Channel B: Google CSE
  if (!skipGoogle) {
    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_CX;

    if (apiKey && cseId) {
      discoveryMode = discoveryMode === 'snap_api' ? 'snap_api' : 'google_only';
      log('DISCOVER', 'Running Google CSE discovery...');

      const SEARCH_QUERIES = [
        'site:snapchat.com/add beard grooming India',
        'site:snapchat.com/add mens grooming India',
        'site:snapchat.com/add skincare men India',
        'site:snapchat.com/add hairstyle barber India',
        'site:snapchat.com/add perfume fragrance India',
        '"snapchat" "men\'s grooming" India influencer',
        '"snapchat" "beard care" India creator',
        '"add me on snapchat" grooming India',
        '"snapchat" "skincare routine" men India',
        '"snapchat" "hair tutorial" men India',
      ];

      const HANDLE_REGEX = /snapchat\.com\/add\/([a-zA-Z0-9._-]{3,30})/i;

      for (let i = 0; i < SEARCH_QUERIES.length; i++) {
        const query = SEARCH_QUERIES[i];
        try {
          const url = new URL('https://www.googleapis.com/customsearch/v1');
          url.searchParams.set('key', apiKey);
          url.searchParams.set('cx', cseId);
          url.searchParams.set('q', query);
          url.searchParams.set('num', '10');

          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          for (const item of data.items || []) {
            const match = item.link.match(HANDLE_REGEX);
            if (match) {
              const handle = match[1].toLowerCase();
              if (!allCreators.has(handle)) {
                allCreators.set(handle, {
                  username: handle,
                  displayName: item.title || handle,
                  bio: '',
                  subscriberCount: null,
                  isVerified: null,
                  country: 'IN',
                  creatorCategory: '',
                  profileUrl: `https://snapchat.com/add/${handle}`,
                  spotlightMetrics: null,
                  source: 'google_cse',
                  profileExists: null,
                  googleSnippet: item.snippet || '',
                  googleTitle: item.title || '',
                  discoveredAt: new Date().toISOString(),
                });
              }
            }
          }

          process.stdout.write(`\r[DISCOVER] Google query ${i + 1}/${SEARCH_QUERIES.length} → ${allCreators.size} total unique`);
        } catch (err) {
          log('DISCOVER', `Google query error: ${err.message}`);
        }

        if (i < SEARCH_QUERIES.length - 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }
      console.log();

      log('DISCOVER', `After Google CSE: ${allCreators.size} total unique creators`);
    } else {
      log('DISCOVER', 'Google CSE not configured — skipping (set GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX)');
    }
  } else {
    log('DISCOVER', 'Google CSE discovery skipped (--skip-google)');
  }

  // Channel C: Manual seeds
  const seedPath = join(CONFIG_DIR, 'seed-creators.json');
  if (existsSync(seedPath)) {
    const seedData = JSON.parse(readFileSync(seedPath, 'utf-8'));
    const seeds = seedData.seed_creators || [];
    let newSeeds = 0;
    for (const seed of seeds) {
      const handle = seed.handle.toLowerCase();
      if (!allCreators.has(handle)) {
        allCreators.set(handle, {
          username: handle,
          displayName: handle,
          bio: '',
          subscriberCount: null,
          isVerified: null,
          country: 'IN',
          creatorCategory: '',
          profileUrl: `https://snapchat.com/add/${handle}`,
          spotlightMetrics: null,
          source: 'manual_seed',
          profileExists: null,
          seedNote: seed.note || '',
          discoveredAt: new Date().toISOString(),
        });
        newSeeds++;
      }
    }
    if (newSeeds > 0) {
      log('DISCOVER', `Added ${newSeeds} manual seeds (${allCreators.size} total)`);
      if (discoveryMode === 'none') discoveryMode = 'seeds_only';
    }
  }

  if (allCreators.size === 0) {
    log('DISCOVER', 'No candidates discovered. Configure API keys or add manual seeds.');
    return { candidates: [], discoveryMode };
  }

  log('DISCOVER', `Total unique candidates: ${allCreators.size}`);

  // Save discovery results
  const candidates = [...allCreators.values()];
  writeFileSync(join(DATA_DIR, 'discovered_creators.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    discoveryMode,
    totalCreators: candidates.length,
    bySouce: {
      snap_api: candidates.filter(c => c.source === 'snap_api').length,
      google_cse: candidates.filter(c => c.source === 'google_cse').length,
      manual_seed: candidates.filter(c => c.source === 'manual_seed').length,
    },
    creators: candidates,
  }, null, 2));

  return { candidates, discoveryMode };
}

// ─── STEP 2: VALIDATE ──────────────────────────────────────

async function stepValidate(candidates) {
  divider('STEP 2: VALIDATE — HEAD Request Profile Check');

  if (skipValidate) {
    log('VALIDATE', 'Skipped (--skip-validate)');
    // Mark non-API candidates as unvalidated
    return candidates.map(c => c.source === 'snap_api' ? { ...c, profileExists: true } : c);
  }

  const needsValidation = candidates.filter(c => c.source !== 'snap_api');
  const apiCandidates = candidates.filter(c => c.source === 'snap_api');

  log('VALIDATE', `${apiCandidates.length} API-discovered (auto-pass), ${needsValidation.length} need HEAD validation`);

  if (needsValidation.length === 0) {
    return candidates.map(c => ({ ...c, profileExists: true }));
  }

  const validated = [...apiCandidates.map(c => ({ ...c, profileExists: true }))];
  const rejected = [];

  for (let i = 0; i < needsValidation.length; i++) {
    const candidate = needsValidation[i];
    const handle = candidate.username;

    if (i > 0) await new Promise(r => setTimeout(r, 1000));

    process.stdout.write(`\r[VALIDATE] ${i + 1}/${needsValidation.length}: @${handle}...`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`https://www.snapchat.com/add/${handle}`, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (response.ok) {
        validated.push({ ...candidate, profileExists: true, validatedAt: new Date().toISOString() });
      } else {
        rejected.push({ handle, reason: `HTTP ${response.status}`, source: candidate.source });
      }
    } catch (err) {
      rejected.push({ handle, reason: err.name === 'AbortError' ? 'timeout' : err.message, source: candidate.source });
    }
  }

  console.log();
  log('VALIDATE', `Results: ${validated.length} exist, ${rejected.length} rejected`);

  // Save validated
  writeFileSync(join(DATA_DIR, 'validated_creators.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    validatedCount: validated.length,
    rejectedCount: rejected.length,
    creators: validated,
    rejected,
  }, null, 2));

  return validated;
}

// ─── STEP 2.5: ENRICH ──────────────────────────────────────

async function stepEnrich(candidates, monitor, circuitBreaker) {
  divider('STEP 2.5: ENRICH — Scrape Public Profile Data');

  if (skipEnrich) {
    log('ENRICH', 'Skipped (--skip-enrich)');
    return candidates;
  }

  // Only enrich non-API candidates that lack subscriber data
  // API-discovered candidates (real, not mock) already have full data
  const needsEnrichment = candidates.filter(c =>
    c.source !== 'snap_api' || useMockApi
  );
  const alreadyRich = candidates.filter(c =>
    c.source === 'snap_api' && !useMockApi
  );

  if (needsEnrichment.length === 0) {
    log('ENRICH', 'All candidates already have API data — skipping');
    return candidates;
  }

  log('ENRICH', `${alreadyRich.length} API-discovered (skip), ${needsEnrichment.length} need web scraping`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const enriched = [...alreadyRich];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < needsEnrichment.length; i++) {
    const candidate = needsEnrichment[i];
    const handle = candidate.username;

    // Check circuit breaker
    if (circuitBreaker.isTripped('snapchat')) {
      log('ENRICH', `Circuit breaker tripped — stopping enrichment at ${i}/${needsEnrichment.length}`);
      monitor.recordCircuitTrip('snapchat', 'Consecutive enrichment failures');
      enriched.push(...needsEnrichment.slice(i));
      break;
    }

    // Throttle: 1.2s between requests
    if (i > 0) await new Promise(r => setTimeout(r, 1200));

    process.stdout.write(`\r[ENRICH] ${i + 1}/${needsEnrichment.length}: @${handle}...`);

    try {
      const profileData = await scrapeProfile(handle, 'snapchat', {
        apiKey,
        cacheDir: DATA_DIR,
        llmCircuitOpen: circuitBreaker.isTripped('haiku'),
      });
      if (profileData.enriched) {
        enriched.push(mergeEnrichmentIntoCandidate(candidate, profileData));
        successCount++;
        circuitBreaker.recordSuccess('snapchat');

        // Record extraction tier in health monitor
        monitor.recordExtraction({
          extractionTier: profileData._extraction?.tier || 0,
        });
      } else {
        enriched.push(candidate); // keep original on failure
        errorCount++;
        const tripped = circuitBreaker.recordFailure('snapchat');
        if (tripped) {
          log('ENRICH', `Circuit breaker TRIPPED for snapchat after ${i + 1} attempts`);
          monitor.recordCircuitTrip('snapchat', profileData.error || 'Unknown');
        }
      }
    } catch (err) {
      enriched.push(candidate);
      errorCount++;
      circuitBreaker.recordFailure('snapchat');
    }
  }

  console.log();
  log('ENRICH', `Results: ${successCount} enriched, ${errorCount} errors`);

  // Save enriched
  writeFileSync(join(DATA_DIR, 'enriched_creators.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    enrichedCount: successCount,
    errorCount,
    creators: enriched,
  }, null, 2));

  return enriched;
}

// ─── STEP 3: FILTER ─────────────────────────────────────────

async function stepFilter(candidates, monitor) {
  divider('STEP 3: FILTER — Gate Validation (G1→G5)');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const passed = [];
  const failed = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    process.stdout.write(`\r[FILTER] ${i + 1}/${candidates.length}: @${candidate.username}...`);

    const result = await runGates(candidate, apiKey);

    if (result.passed) {
      passed.push({ ...candidate, gateResults: result.results });
    } else {
      failed.push({
        handle: candidate.username,
        failedAt: result.failedAt,
        reason: result.results.find(r => !r.passed)?.reason || 'unknown',
      });
      monitor.recordGateRejection(result.failedAt);
    }

    // Small delay between Haiku calls (gate G5)
    if (apiKey && i < candidates.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log();
  log('FILTER', `Results: ${passed.length} passed, ${failed.length} rejected`);

  if (failed.length > 0) {
    const failCounts = {};
    for (const f of failed) {
      failCounts[f.failedAt] = (failCounts[f.failedAt] || 0) + 1;
    }
    log('FILTER', `Rejections by gate: ${JSON.stringify(failCounts)}`);
  }

  // Save filtered
  writeFileSync(join(DATA_DIR, 'filtered_creators.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    passedCount: passed.length,
    rejectedCount: failed.length,
    candidates: passed,
    rejected: failed,
  }, null, 2));

  return passed;
}

// ─── STEP 5: OUTPUT ─────────────────────────────────────────

function stepOutput(candidates, discoveryMode) {
  divider('STEP 5: OUTPUT — Generate Reports');

  const jsonReport = {
    generatedAt: new Date().toISOString(),
    pipelineVersion: '3.1.0',
    discoveryMode,
    summary: {
      totalCandidates: candidates.length,
      withContacts: candidates.filter(c => c.contacts && (c.contacts.phone || c.contacts.instagram || c.contacts.youtube)).length,
    },
    candidates: candidates.map((c, i) => ({
      rank: i + 1,
      username: c.username,
      displayName: c.displayName || '',
      profileUrl: c.profileUrl || `https://snapchat.com/add/${c.username}`,
      subscriberCount: c.subscriberCount,
      isVerified: c.isVerified,
      country: c.country,
      creatorCategory: c.creatorCategory,
      spotlightVideoCount: c.spotlightMetrics?.videoCount || null,
      avgViewsPerVideo: c.spotlightMetrics?.avgViewsPerVideo || null,
      bio: c.bio || '',
      source: c.source,
      contacts: c.contacts || { phone: null, whatsapp: null, instagram: null, youtube: null, twitter: null, otherLinks: [] },
    })),
  };

  writeFileSync(join(OUTPUT_DIR, 'scouting_report.json'), JSON.stringify(jsonReport, null, 2));
  log('OUTPUT', 'Wrote output/scouting_report.json');

  const csvHeaders = [
    'Rank', 'Username', 'Profile URL', 'Subscribers', 'Spotlight Videos',
    'Bio', 'Phone', 'WhatsApp', 'Instagram', 'YouTube', 'Twitter', 'Source',
  ];

  const csvRows = candidates.map((c, i) => [
    i + 1,
    `@${c.username}`,
    c.profileUrl || `https://snapchat.com/add/${c.username}`,
    c.subscriberCount || '',
    c.spotlightMetrics?.videoCount || '',
    `"${(c.bio || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    c.contacts?.phone || '',
    c.contacts?.whatsapp || '',
    c.contacts?.instagram || '',
    c.contacts?.youtube || '',
    c.contacts?.twitter || '',
    c.source || '',
  ]);

  const csvContent = [csvHeaders.join(','), ...csvRows.map(row => row.join(','))].join('\n');
  writeFileSync(join(OUTPUT_DIR, 'scouting_report.csv'), csvContent);
  log('OUTPUT', 'Wrote output/scouting_report.csv');

  divider('PIPELINE COMPLETE — Summary');
  console.log(`  Discovery Mode:     ${discoveryMode}`);
  console.log(`  Total Candidates:   ${candidates.length}`);
  console.log(`  With Contact Info:  ${jsonReport.summary.withContacts}`);
  console.log();
  if (candidates.length > 0) {
    console.log('  Top candidates:');
    for (const c of candidates.slice(0, 5)) {
      const subs = c.subscriberCount ? ` (${c.subscriberCount.toLocaleString()} subs)` : '';
      const contact = c.contacts?.instagram ? ` IG:@${c.contacts.instagram}` : c.contacts?.phone ? ` Ph:${c.contacts.phone}` : '';
      console.log(`    @${c.username}${subs}${contact}`);
    }
    console.log();
  }
  console.log('  Reports saved:');
  console.log('    output/scouting_report.json');
  console.log('    output/scouting_report.csv');
  console.log();
}

// ─── MAIN ────────────────────────────────────────────────────

async function main() {
  console.log();
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  GCPL Snapchat Influencer Scouting Pipeline v3.1        ║');
  console.log('║  4-Tier Extraction · Self-Healing · Health Monitoring    ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const startTime = Date.now();

  // Initialize health monitor + circuit breaker
  const monitor = new HealthMonitor(CONFIG_DIR, DATA_DIR, OUTPUT_DIR);
  const circuitBreaker = new CircuitBreaker(5); // 5 consecutive failures trips

  // Check for existing checkpoint (resume interrupted runs)
  const checkpointPath = join(DATA_DIR, 'pipeline_checkpoint.json');
  if (!freshRun && existsSync(checkpointPath)) {
    try {
      const cp = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
      log('PIPELINE', `Found checkpoint: step=${cp.step}, candidates=${cp.candidateCount}, saved=${cp.savedAt}`);
      log('PIPELINE', 'Use --fresh to start a new run');
    } catch { /* ignore corrupt checkpoint */ }
  }

  // Step 1: Discover
  const { candidates: discovered, discoveryMode } = await stepDiscover();
  if (discovered.length === 0) {
    log('PIPELINE', 'No candidates to process. Configure API keys or add manual seeds.');
    return;
  }
  saveCheckpoint('DISCOVER', discovered.length);

  // Step 2: Validate
  const validated = await stepValidate(discovered);
  if (validated.length === 0) {
    log('PIPELINE', 'All candidates failed validation.');
    return;
  }
  saveCheckpoint('VALIDATE', validated.length);

  // Step 2.5: Enrich (scrape public profile pages — 4-tier extraction)
  const enriched = await stepEnrich(validated, monitor, circuitBreaker);
  saveCheckpoint('ENRICH', enriched.length);

  // Step 3: Filter
  const filtered = await stepFilter(enriched, monitor);
  if (filtered.length === 0) {
    log('PIPELINE', 'All candidates filtered out. Try broadening filters or adding more seeds.');
    return;
  }
  saveCheckpoint('FILTER', filtered.length);

  // Step 4: Output (scoring removed in v3.1)
  stepOutput(filtered, discoveryMode);

  // Post-pipeline: auto-seeds, snowball, health report, dashboard
  postPipeline(filtered, enriched, monitor);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('PIPELINE', `Total time: ${elapsed}s`);
}

main().catch(err => {
  console.error('\nFatal pipeline error:', err);
  process.exit(1);
});
