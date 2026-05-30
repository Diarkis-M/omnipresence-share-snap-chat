#!/usr/bin/env node

/**
 * Profile Enrichment Scraper — extracts real data from public Snapchat profiles.
 *
 * Uses the 4-tier adaptive extraction engine:
 *   Tier 1: __NEXT_DATA__ SSR JSON (free, most stable)
 *   Tier 2: Regex with cross-validation (free, catches drift)
 *   Tier 3: LLM via Haiku (~$0.002, adapts to any HTML change)
 *   Tier 4: Cached data fallback (free, stale but non-zero)
 *
 * Input:  data/validated_creators.json OR config/seed-creators.json
 * Output: data/enriched_creators.json
 *
 * Throttle: 1 request/second (respectful, avoids rate limiting)
 * No auth required. No API key. No headless browser. Pure HTTP fetch.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extract, saveToCache, extractSnowballHandles } from '../src/lib/extractor.js';
import { fetchWithRetry } from '../src/lib/resilience.js';
import { parseContacts } from '../src/lib/contact-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const CONFIG_DIR = join(ROOT, 'config');

function log(msg) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [enrich] ${msg}`);
}

// ─────────────────────────────────────────────────────────
// Core: fetch a profile page and extract via 4-tier engine
// ─────────────────────────────────────────────────────────

/**
 * Fetch a Snapchat public profile and extract structured data
 * via the 4-tier adaptive extraction engine.
 *
 * @param {string} handle - Snapchat username
 * @param {string} [platform='snapchat'] - Platform identifier
 * @param {Object} [opts] - Options for extraction
 * @param {string} [opts.apiKey] - Anthropic API key for Tier 3 LLM
 * @param {string} [opts.cacheDir] - Cache directory for Tier 4
 * @param {boolean} [opts.llmCircuitOpen] - If true, skip Tier 3
 * @returns {Promise<Object>} Enriched profile data
 */
async function scrapeProfile(handle, platform = 'snapchat', opts = {}) {
  const url = `https://www.snapchat.com/add/${handle}`;

  try {
    const resp = await fetchWithRetry(url);

    if (!resp.ok) {
      return { handle, error: `HTTP ${resp.status}`, enriched: false };
    }

    const html = await resp.text();

    // Run 4-tier extraction engine
    const extraction = await extract(handle, platform, html, {
      apiKey: opts.apiKey,
      cacheDir: opts.cacheDir || DATA_DIR,
      llmCircuitOpen: opts.llmCircuitOpen || false,
    });

    // Save to cache for future Tier 4 fallback
    if (extraction.extractionTier > 0 && extraction.extractionTier < 4) {
      saveToCache(opts.cacheDir || DATA_DIR, handle, extraction);
    }

    // Extract snowball handles for discovery expansion
    const snowballHandles = extractSnowballHandles(html, platform, handle);

    if (extraction.error) {
      return { handle, error: extraction.error, enriched: false, _extraction: extraction._meta };
    }

    return {
      handle,
      enriched: true,
      ...extraction.data,
      _extraction: {
        tier: extraction.extractionTier,
        method: extraction.extractionMethod,
        crossValidated: extraction.crossValidated,
        stale: extraction.stale,
        meta: extraction._meta,
      },
      _snowballHandles: snowballHandles,
    };
  } catch (err) {
    return { handle, error: err.message, enriched: false };
  }
}

// ─────────────────────────────────────────────────────────
// Merge enrichment data into candidate records
// ─────────────────────────────────────────────────────────

function mergeEnrichmentIntoCandidate(candidate, enrichment) {
  if (!enrichment.enriched) return candidate;

  const bio = enrichment.bio || candidate.bio || '';
  const contacts = parseContacts(bio, {
    websiteUrl: enrichment.websiteUrl || '',
    address: enrichment.address || '',
  });

  return {
    ...candidate,
    displayName: enrichment.displayName || candidate.displayName,
    subscriberCount: enrichment.subscriberCount || candidate.subscriberCount,
    bio,
    isVerified: enrichment.isVerified || candidate.isVerified || false,
    country: candidate.country || 'IN',
    creatorCategory: enrichment.creatorCategory || candidate.creatorCategory || '',
    spotlightMetrics: {
      totalViews: enrichment.totalViews || 0,
      avgViewsPerVideo: enrichment.avgViewsPerVideo || 0,
      videoCount: enrichment.spotlightVideoCount || 0,
      shareCount: 0,
    },
    contacts,
    // Extraction provenance (replaces old _enrichment)
    _extraction: {
      tier: enrichment._extraction?.tier,
      method: enrichment._extraction?.method,
      crossValidated: enrichment._extraction?.crossValidated,
      stale: enrichment._extraction?.stale,
      address: enrichment.address || '',
      websiteUrl: enrichment.websiteUrl || '',
      hasStory: enrichment.hasStory || false,
      spotlightHashtags: enrichment.spotlightHashtags || [],
      spotlightPostingFrequency: enrichment.spotlightPostingFrequency || null,
      spotlightVideos: enrichment.spotlightVideos || [],
      createdAt: enrichment.createdAt || null,
      lastUpdatedAt: enrichment.lastUpdatedAt || null,
      enrichedAt: new Date().toISOString(),
    },
    _snowballHandles: enrichment._snowballHandles || [],
    source: candidate.source || 'manual_seed',
    profileExists: true,
  };
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main() {
  log('Starting Snapchat profile enrichment...');

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  // Load candidates: prefer validated, fallback to seeds
  let candidates = [];
  const validatedPath = join(DATA_DIR, 'validated_creators.json');
  const seedPath = join(CONFIG_DIR, 'seed-creators.json');

  if (existsSync(validatedPath)) {
    const data = JSON.parse(readFileSync(validatedPath, 'utf-8'));
    candidates = data.creators || [];
    log(`Loaded ${candidates.length} from validated_creators.json`);
  } else if (existsSync(seedPath)) {
    const data = JSON.parse(readFileSync(seedPath, 'utf-8'));
    candidates = (data.seed_creators || []).map(s => ({
      username: s.handle,
      displayName: s.handle,
      bio: '',
      subscriberCount: null,
      country: 'IN',
      source: 'manual_seed',
      profileUrl: `https://snapchat.com/add/${s.handle}`,
      seedNote: s.note || '',
    }));
    log(`Loaded ${candidates.length} from seed-creators.json`);
  }

  if (candidates.length === 0) {
    log('No candidates to enrich. Run validate-handles.js or add seeds first.');
    return;
  }

  // Check for --force flag (re-enrich even if data exists)
  const force = process.argv.includes('--force');

  // Load existing enrichment data (skip already-enriched unless --force)
  const enrichedPath = join(DATA_DIR, 'enriched_creators.json');
  let existingEnrichment = {};
  if (!force && existsSync(enrichedPath)) {
    const existing = JSON.parse(readFileSync(enrichedPath, 'utf-8'));
    for (const c of existing.creators || []) {
      if (c._extraction?.enrichedAt || c._extraction?.tier) {
        existingEnrichment[c.username?.toLowerCase()] = c;
      }
    }
    log(`Found ${Object.keys(existingEnrichment).length} previously enriched (use --force to re-scrape)`);
  }

  log(`Enriching ${candidates.length} profiles via HTTP scraping...`);

  const enriched = [];
  const errors = [];
  let skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const handle = (candidate.username || candidate.handle || '').toLowerCase();

    if (!handle) continue;

    // Skip if already enriched (unless --force)
    if (!force && existingEnrichment[handle]) {
      enriched.push(existingEnrichment[handle]);
      skipped++;
      continue;
    }

    // Throttle: 1.2s between requests
    if (i > 0 && (i - skipped) > 0) {
      await new Promise(r => setTimeout(r, 1200));
    }

    process.stdout.write(`\r[enrich] ${i + 1}/${candidates.length}: @${handle}...`);

    const enrichment = await scrapeProfile(handle, 'snapchat');

    if (enrichment.enriched) {
      const merged = mergeEnrichmentIntoCandidate(candidate, enrichment);
      enriched.push(merged);
    } else {
      errors.push({ handle, error: enrichment.error });
      // Keep original candidate data even if enrichment fails
      enriched.push(candidate);
    }
  }

  console.log();
  log(`Enrichment complete: ${enriched.filter(c => c._extraction).length} enriched, ${errors.length} errors, ${skipped} cached`);

  // Save enriched data
  const output = {
    generatedAt: new Date().toISOString(),
    source: 'web_scrape',
    totalCandidates: candidates.length,
    enrichedCount: enriched.filter(c => c._extraction).length,
    errorCount: errors.length,
    creators: enriched,
    errors,
  };

  writeFileSync(enrichedPath, JSON.stringify(output, null, 2));
  log(`Output: data/enriched_creators.json`);

  // Print summary table
  console.log('\n┌─────────────────────────┬──────────┬────────────┬───────────┐');
  console.log('│ Handle                  │ Subs     │ Spotlight  │ Bio       │');
  console.log('├─────────────────────────┼──────────┼────────────┼───────────┤');
  for (const c of enriched.filter(c => c._extraction)) {
    const handle = `@${c.username}`.padEnd(23);
    const subs = (c.subscriberCount ? formatNumber(c.subscriberCount) : '—').padEnd(8);
    const vids = (c.spotlightMetrics?.videoCount?.toString() || '—').padStart(4) + ' vids  ';
    const bio = (c.bio || '—').slice(0, 9).padEnd(9);
    console.log(`│ ${handle} │ ${subs} │ ${vids}│ ${bio} │`);
  }
  console.log('└─────────────────────────┴──────────┴────────────┴───────────┘');

  if (errors.length > 0) {
    log(`Errors (${errors.length}):`);
    for (const e of errors) {
      log(`  @${e.handle} — ${e.error}`);
    }
  }
}

// ─────────────────────────────────────────────────────────
// Exports (for use in run-pipeline.js)
// ─────────────────────────────────────────────────────────

export { scrapeProfile, mergeEnrichmentIntoCandidate };

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

// Only auto-run when executed directly (not when imported by run-pipeline.js)
const isMainScript = process.argv[1]?.includes('enrich-profiles');
if (isMainScript) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
