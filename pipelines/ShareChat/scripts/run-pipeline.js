#!/usr/bin/env node

/**
 * Full ShareChat Scouting Pipeline Orchestrator — v1.0
 *
 * Zero-cost scraping, Haiku-only LLM. Uses ONLY:
 *   - Google Custom Search (free tier, 100 queries/day)
 *   - ShareChat web scraping (public profile pages)
 *   - Manual seeds
 *   - Claude Haiku (relevance gate + scoring)
 *
 * Pipeline steps:
 *   1.   DISCOVER — Google CSE + manual seeds (+ optional tag API)
 *   2.   VALIDATE — HEAD requests for all candidates
 *   2.5  ENRICH   — Scrape public profile pages for real data
 *   3.   FILTER   — Gates G1->G5
 *   4.   SCORE    — Claude Haiku scoring
 *   5.   OUTPUT   — CSV + JSON reports
 *
 * Usage:
 *   node scripts/run-pipeline.js                         # full pipeline
 *   node scripts/run-pipeline.js --skip-google           # skip Google CSE
 *   node scripts/run-pipeline.js --skip-validate         # skip HEAD validation
 *   node scripts/run-pipeline.js --skip-enrich           # skip profile scraping
 *   node scripts/run-pipeline.js --max-score 20          # limit scoring count
 *   node scripts/run-pipeline.js --brand "Muuchstac"     # set brand context
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
const skipGoogle = args.includes('--skip-google');
const skipValidate = args.includes('--skip-validate');
const skipEnrich = args.includes('--skip-enrich');
const freshRun = args.includes('--fresh');

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

// ShareChat-specific handle extraction
const SHARECHAT_HANDLE_REGEX = /sharechat\.com\/profile\/([a-zA-Z0-9._-]{3,50})/i;
const MOJ_HANDLE_REGEX = /mojapp\.in\/@([a-zA-Z0-9._-]{3,50})/i;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ─── STEP 1: DISCOVER ──────────────────────────────────────

async function stepDiscover(monitor) {
  divider('STEP 1: DISCOVER — Find ShareChat/Moj Creators');

  const allCreators = new Map();
  let discoveryMode = 'none';

  // Channel A: Google CSE
  if (!skipGoogle) {
    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_CX;

    if (apiKey && cseId) {
      discoveryMode = 'google_cse';
      log('DISCOVER', 'Running Google CSE discovery (config-driven)...');

      // Load queries from config with lifecycle tracking
      const queryConfig = loadConfigSafe(join(CONFIG_DIR, 'search-queries.json'), { queries: [], _archive: [] });
      const activeQueries = queryConfig.queries.filter(q => q.status !== 'stale');

      log('DISCOVER', `${activeQueries.length} active queries loaded from config`);

      for (let i = 0; i < activeQueries.length; i++) {
        const q = activeQueries[i];
        const prevSize = allCreators.size;
        try {
          const url = new URL('https://www.googleapis.com/customsearch/v1');
          url.searchParams.set('key', apiKey);
          url.searchParams.set('cx', cseId);
          url.searchParams.set('q', q.query);
          url.searchParams.set('num', '10');

          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data = await response.json();
          for (const item of data.items || []) {
            let match = item.link.match(SHARECHAT_HANDLE_REGEX);
            let platform = 'sharechat';
            if (!match) {
              match = item.link.match(MOJ_HANDLE_REGEX);
              platform = 'moj';
            }

            if (match) {
              const handle = match[1].toLowerCase();
              if (!allCreators.has(handle)) {
                allCreators.set(handle, {
                  username: handle,
                  displayName: item.title || handle,
                  bio: '',
                  followerCount: null,
                  followingCount: null,
                  postCount: null,
                  isVerified: null,
                  country: 'IN',
                  language: null,
                  platform,
                  profileUrl: platform === 'sharechat'
                    ? `https://sharechat.com/profile/${handle}`
                    : `https://mojapp.in/@${handle}`,
                  source: 'google_cse',
                  profileExists: null,
                  googleSnippet: item.snippet || '',
                  googleTitle: item.title || '',
                  discoveredAt: new Date().toISOString(),
                });
              }
            }
          }

          // Update query lifecycle stats
          const handlesFound = allCreators.size - prevSize;
          q.stats.timesRun++;
          if (handlesFound > 0) {
            q.stats.totalHandlesFound += handlesFound;
            q.stats.lastYieldedAt = new Date().toISOString();
            q.stats.consecutiveZeros = 0;
            if (q.status === 'experimental') q.status = 'proven';
          } else {
            q.stats.consecutiveZeros++;
          }
          monitor.recordQueryYield(q.query, handlesFound, q.source);

          process.stdout.write(`\r[DISCOVER] Google query ${i + 1}/${activeQueries.length} → ${allCreators.size} total unique`);
        } catch (err) {
          log('DISCOVER', `Google query error: ${err.message}`);
          q.stats.consecutiveZeros++;
        }

        if (i < activeQueries.length - 1) {
          await new Promise(r => setTimeout(r, 1200));
        }
      }
      console.log();

      // Prune experimental queries with 3+ consecutive zeros
      const toArchive = [];
      queryConfig.queries = queryConfig.queries.filter(q => {
        if (q.source === 'llm_generated' && q.stats.consecutiveZeros >= 3) {
          toArchive.push({ ...q, archivedAt: new Date().toISOString(), reason: '3_consecutive_zeros' });
          return false;
        }
        // Flag manual queries as stale (never remove)
        if (q.source === 'manual' && q.stats.consecutiveZeros >= 5) {
          q.status = 'stale';
        }
        return true;
      });
      queryConfig._archive.push(...toArchive);

      // Save updated query config
      writeFileSync(join(CONFIG_DIR, 'search-queries.json'), JSON.stringify(queryConfig, null, 2));
      if (toArchive.length > 0) {
        log('DISCOVER', `Archived ${toArchive.length} zero-yield queries`);
      }

      // LLM query generation (if under cap and API key available)
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (anthropicKey && activeQueries.length < 20) {
        try {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const client = new Anthropic({ apiKey: anthropicKey });

          const yieldSummary = activeQueries.map(q =>
            `"${q.query}" → ${q.stats.consecutiveZeros === 0 ? q.stats.totalHandlesFound + ' total handles' : q.stats.consecutiveZeros + ' consecutive zeros'}`
          ).join('\n');

          const msg = await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{ role: 'user', content: `You help discover men's grooming creators on ShareChat (Indian social media).

Current search queries and their performance:
${yieldSummary}

Generate exactly 3 new Google Custom Search queries that might find men's grooming, beard care, hairstyle, or skincare creators on ShareChat. Use site:sharechat.com/profile format. Target Hindi and regional Indian languages.

Return ONLY a JSON array of 3 query strings, no other text:
["query1", "query2", "query3"]` }],
          });

          const newQueries = JSON.parse(msg.content[0].text.trim());
          if (Array.isArray(newQueries)) {
            for (const nq of newQueries.slice(0, 3)) {
              queryConfig.queries.push({
                query: nq, source: 'llm_generated', status: 'experimental',
                addedAt: new Date().toISOString(),
                stats: { timesRun: 0, totalHandlesFound: 0, lastYieldedAt: null, consecutiveZeros: 0 },
              });
            }
            writeFileSync(join(CONFIG_DIR, 'search-queries.json'), JSON.stringify(queryConfig, null, 2));
            log('DISCOVER', `LLM generated ${newQueries.length} new experimental queries`);
          }
        } catch (err) {
          log('DISCOVER', `LLM query generation skipped: ${err.message}`);
        }
      }

      log('DISCOVER', `After Google CSE: ${allCreators.size} unique creators`);
    } else {
      log('DISCOVER', 'Google CSE not configured — skipping (set GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX)');
    }
  } else {
    log('DISCOVER', 'Google CSE discovery skipped (--skip-google)');
  }

  // Channel B: Manual seeds
  const seedPath = join(CONFIG_DIR, 'seed-creators.json');
  if (existsSync(seedPath)) {
    const seedData = JSON.parse(readFileSync(seedPath, 'utf-8'));
    const seeds = seedData.seed_creators || [];
    let newSeeds = 0;
    for (const seed of seeds) {
      const handle = seed.handle.toLowerCase();
      if (!allCreators.has(handle)) {
        const platform = seed.platform || 'sharechat';
        allCreators.set(handle, {
          username: handle,
          displayName: handle,
          bio: '',
          followerCount: null,
          followingCount: null,
          postCount: null,
          isVerified: null,
          country: 'IN',
          language: seed.language || null,
          platform,
          profileUrl: platform === 'moj'
            ? `https://mojapp.in/@${handle}`
            : `https://sharechat.com/profile/${handle}`,
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
    platform: 'sharechat',
    totalCreators: candidates.length,
    bySource: {
      google_cse: candidates.filter(c => c.source === 'google_cse').length,
      manual_seed: candidates.filter(c => c.source === 'manual_seed').length,
      sharechat_tag_api: candidates.filter(c => c.source === 'sharechat_tag_api').length,
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
    return candidates;
  }

  const needsValidation = candidates.filter(c => c.source !== 'sharechat_tag_api');
  const apiCandidates = candidates.filter(c => c.source === 'sharechat_tag_api');

  log('VALIDATE', `${apiCandidates.length} tag-API (auto-pass), ${needsValidation.length} need HEAD validation`);

  if (needsValidation.length === 0) {
    return candidates.map(c => ({ ...c, profileExists: true }));
  }

  const validated = [...apiCandidates.map(c => ({ ...c, profileExists: true }))];
  const rejected = [];

  for (let i = 0; i < needsValidation.length; i++) {
    const candidate = needsValidation[i];
    const handle = candidate.username;
    const platform = candidate.platform || 'sharechat';

    if (i > 0) await new Promise(r => setTimeout(r, 1000));

    process.stdout.write(`\r[VALIDATE] ${i + 1}/${needsValidation.length}: @${handle} (${platform})...`);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const url = platform === 'moj'
        ? `https://mojapp.in/@${handle}`
        : `https://sharechat.com/profile/${handle}`;

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
      });

      clearTimeout(timeout);

      if (response.ok) {
        validated.push({ ...candidate, profileExists: true, validatedAt: new Date().toISOString() });
      } else {
        rejected.push({ handle, platform, reason: `HTTP ${response.status}`, source: candidate.source });
      }
    } catch (err) {
      rejected.push({ handle, platform, reason: err.name === 'AbortError' ? 'timeout' : err.message, source: candidate.source });
    }
  }

  console.log();
  log('VALIDATE', `Results: ${validated.length} exist, ${rejected.length} rejected`);

  writeFileSync(join(DATA_DIR, 'validated_creators.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: 'sharechat',
    validatedCount: validated.length,
    rejectedCount: rejected.length,
    creators: validated,
    rejected,
  }, null, 2));

  return validated;
}

// ─── STEP 2.5: ENRICH ──────────────────────────────────────

async function stepEnrich(candidates, monitor, circuitBreaker) {
  divider('STEP 2.5: ENRICH — 4-Tier Adaptive Extraction');

  if (skipEnrich) {
    log('ENRICH', 'Skipped (--skip-enrich)');
    return candidates;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Only enrich candidates that lack follower data
  const needsEnrichment = candidates.filter(c => !c.followerCount);
  const alreadyRich = candidates.filter(c => c.followerCount);

  if (needsEnrichment.length === 0) {
    log('ENRICH', 'All candidates already have data — skipping');
    return candidates;
  }

  log('ENRICH', `${alreadyRich.length} already enriched, ${needsEnrichment.length} need web scraping`);

  const enriched = [...alreadyRich];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < needsEnrichment.length; i++) {
    const candidate = needsEnrichment[i];
    const handle = candidate.username;
    const platform = candidate.platform || 'sharechat';

    // Check circuit breaker
    if (circuitBreaker.isTripped(platform)) {
      enriched.push(candidate);
      continue;
    }

    // Throttle: 1.2s between requests
    if (i > 0) await new Promise(r => setTimeout(r, 1200));

    process.stdout.write(`\r[ENRICH] ${i + 1}/${needsEnrichment.length}: @${handle} (${platform})...`);

    try {
      const profileData = await scrapeProfile(handle, platform, {
        apiKey,
        cacheDir: DATA_DIR,
        llmCircuitOpen: circuitBreaker.isTripped('haiku'),
      });

      if (profileData.enriched) {
        monitor.recordExtraction(profileData);
        enriched.push(mergeEnrichmentIntoCandidate(candidate, profileData));
        circuitBreaker.recordSuccess(platform);
        successCount++;
      } else {
        const tripped = circuitBreaker.recordFailure(platform);
        if (tripped) {
          monitor.recordCircuitTrip(platform, profileData.error || 'enrichment failed');
          log('ENRICH', `Circuit breaker tripped for ${platform}`);
        }
        enriched.push(candidate);
        errorCount++;
      }
    } catch (err) {
      circuitBreaker.recordFailure(platform);
      enriched.push(candidate);
      errorCount++;
    }
  }

  console.log();
  log('ENRICH', `Results: ${successCount} enriched, ${errorCount} errors`);

  writeFileSync(join(DATA_DIR, 'enriched_creators.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: 'sharechat',
    enrichedCount: successCount,
    errorCount,
    creators: enriched,
  }, null, 2));

  return enriched;
}

// ─── STEP 3: FILTER ─────────────────────────────────────────

async function stepFilter(candidates, monitor) {
  divider('STEP 3: FILTER — Gate Validation (G1->G5)');

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

  writeFileSync(join(DATA_DIR, 'filtered_creators.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    platform: 'sharechat',
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
    pipelineVersion: '2.1.0',
    platform: 'sharechat',
    discoveryMode,
    summary: {
      totalCandidates: candidates.length,
      withContacts: candidates.filter(c => c.contacts && (c.contacts.phone || c.contacts.instagram || c.contacts.youtube)).length,
    },
    candidates: candidates.map((c, i) => ({
      rank: i + 1,
      username: c.username,
      displayName: c.displayName || '',
      profileUrl: c.profileUrl || `https://sharechat.com/profile/${c.username}`,
      followerCount: c.followerCount,
      followingCount: c.followingCount,
      postCount: c.postCount,
      isVerified: c.isVerified,
      country: c.country,
      language: c.language,
      platform: c.platform,
      bio: c.bio || '',
      source: c.source,
      contacts: c.contacts || { phone: null, whatsapp: null, instagram: null, youtube: null, twitter: null, otherLinks: [] },
    })),
  };

  writeFileSync(join(OUTPUT_DIR, 'scouting_report.json'), JSON.stringify(jsonReport, null, 2));
  log('OUTPUT', 'Wrote output/scouting_report.json');

  const csvHeaders = [
    'Rank', 'Username', 'Profile URL', 'Followers', 'Posts',
    'Language', 'Bio', 'Phone', 'WhatsApp', 'Instagram', 'YouTube', 'Twitter', 'Source',
  ];

  const csvRows = candidates.map((c, i) => [
    i + 1,
    `@${c.username}`,
    c.profileUrl || `https://sharechat.com/profile/${c.username}`,
    c.followerCount || '',
    c.postCount || '',
    c.language || '',
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
  console.log(`  Platform:           ShareChat / Moj`);
  console.log(`  Discovery Mode:     ${discoveryMode}`);
  console.log(`  Total Candidates:   ${candidates.length}`);
  console.log(`  With Contact Info:  ${jsonReport.summary.withContacts}`);
  console.log();
  if (candidates.length > 0) {
    console.log('  Top candidates:');
    for (const c of candidates.slice(0, 5)) {
      const followers = c.followerCount ? ` (${c.followerCount.toLocaleString()} followers)` : '';
      const contact = c.contacts?.instagram ? ` IG:@${c.contacts.instagram}` : c.contacts?.phone ? ` Ph:${c.contacts.phone}` : '';
      console.log(`    @${c.username}${followers}${contact}`);
    }
    console.log();
  }
  console.log('  Reports saved:');
  console.log('    output/scouting_report.json');
  console.log('    output/scouting_report.csv');
  console.log();
}

// ─── MAIN ────────────────────────────────────────────────────

function saveCheckpoint(step, candidateCount) {
  writeFileSync(join(DATA_DIR, 'pipeline_checkpoint.json'), JSON.stringify({
    lastCompletedStep: step,
    timestamp: new Date().toISOString(),
    candidateCount,
  }, null, 2));
}

async function postPipeline(scored, enriched, monitor) {
  divider('POST-PIPELINE — Auto-maintenance');

  // 1. Auto-expand seeds with high scorers
  const seedPath = join(CONFIG_DIR, 'seed-creators.json');
  const seedData = loadConfigSafe(seedPath, { seed_creators: [] });
  const existingHandles = new Set(seedData.seed_creators.map(s => s.handle.toLowerCase()));
  let newSeeds = 0;
  for (const c of scored) {
    if ((c.followerCount || 0) >= 10000 && !existingHandles.has(c.username.toLowerCase())) {
      seedData.seed_creators.push({
        handle: c.username,
        platform: c.platform || 'sharechat',
        language: c.language || null,
        note: `Auto-added: ${c.followerCount || 0} followers`,
        auto_added: true,
        addedAt: new Date().toISOString(),
        lastValidated: new Date().toISOString(),
      });
      existingHandles.add(c.username.toLowerCase());
      newSeeds++;
    }
  }
  if (newSeeds > 0) {
    writeFileSync(seedPath, JSON.stringify(seedData, null, 2));
    log('POST', `Auto-added ${newSeeds} high-scoring creators to seed list`);
  }

  // 2. Collect snowball handles for next run
  const snowballHandles = [];
  for (const c of enriched) {
    if (c._snowballHandles?.length > 0) {
      for (const h of c._snowballHandles) {
        if (!existingHandles.has(h.toLowerCase())) {
          snowballHandles.push(h);
          existingHandles.add(h.toLowerCase());
        }
      }
    }
  }
  if (snowballHandles.length > 0) {
    const snowballPath = join(DATA_DIR, 'snowball_candidates.json');
    writeFileSync(snowballPath, JSON.stringify({
      generatedAt: new Date().toISOString(),
      handles: snowballHandles,
      note: 'These handles were discovered via snowball. Add to next run by importing into seeds or discovery.',
    }, null, 2));
    log('POST', `Snowball discovered ${snowballHandles.length} new handles (saved to data/snowball_candidates.json)`);
  }

  // 3. Record model info
  monitor.recordModelInfo(getActiveModel());

  // 4. Finalize health report
  const metrics = monitor.finalize();
  log('POST', `Health report saved to output/health_report.json`);

  // 5. Generate dashboard
  let history = [];
  const historyPath = join(DATA_DIR, 'run_history.json');
  if (existsSync(historyPath)) {
    try { history = JSON.parse(readFileSync(historyPath, 'utf-8')); } catch {}
  }
  const dashboardHtml = generateDashboard(metrics, history);
  writeFileSync(join(OUTPUT_DIR, 'health_dashboard.html'), dashboardHtml);
  log('POST', `Health dashboard saved to output/health_dashboard.html`);

  // 6. Print warnings
  if (metrics.warnings.length > 0) {
    console.log();
    log('POST', `${metrics.warnings.length} warning(s):`);
    for (const w of metrics.warnings) {
      log('POST', `  ${w}`);
    }
  }
}

async function main() {
  console.log();
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  GCPL ShareChat Influencer Scouting Pipeline v2.1       ║');
  console.log('║  4-Tier Extraction · Health Monitoring · Self-Expanding  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const startTime = Date.now();

  // Initialize health monitoring and circuit breakers
  const monitor = new HealthMonitor(CONFIG_DIR, DATA_DIR, OUTPUT_DIR);
  const circuitBreaker = new CircuitBreaker(5);

  // Check for existing checkpoint
  const checkpointPath = join(DATA_DIR, 'pipeline_checkpoint.json');
  if (!freshRun && existsSync(checkpointPath)) {
    const cp = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
    log('PIPELINE', `Previous run checkpoint found: ${cp.lastCompletedStep} at ${cp.timestamp}. Use --fresh to restart.`);
  }

  // Step 1: Discover
  const { candidates: discovered, discoveryMode } = await stepDiscover(monitor);
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

  // Step 2.5: Enrich (scrape profile pages via 4-tier extraction)
  const enriched = await stepEnrich(validated, monitor, circuitBreaker);
  saveCheckpoint('ENRICH', enriched.length);

  // Step 3: Filter
  const filtered = await stepFilter(enriched, monitor);
  if (filtered.length === 0) {
    log('PIPELINE', 'All candidates filtered out. Try broadening filters or adding more seeds.');
    return;
  }
  saveCheckpoint('FILTER', filtered.length);

  // Step 4: Output (scoring removed in v2.1)
  stepOutput(filtered, discoveryMode);

  // Post-pipeline: auto-expand seeds, generate dashboard
  await postPipeline(filtered, enriched, monitor);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log('PIPELINE', `Total time: ${elapsed}s`);
}

main().catch(err => {
  console.error('\nFatal pipeline error:', err);
  process.exit(1);
});
