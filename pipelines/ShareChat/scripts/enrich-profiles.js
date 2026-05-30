#!/usr/bin/env node

/**
 * Profile Enrichment Scraper — extracts real data from public ShareChat profiles.
 *
 * ShareChat profile pages at sharechat.com/profile/{handle} server-render:
 *   1. JSON-LD (schema.org/Person) — follower count, display name, handle
 *   2. HTML profile stats — follower count, following count, post count
 *   3. Bio text — in a styled div after the stats section
 *   4. Display name — in a div before the @handle
 *   5. Meta tags — og:title, og:image
 *
 * Three extraction tiers (fallback chain):
 *   Tier 1: JSON-LD (cleanest, most reliable)
 *   Tier 2: HTML regex (follower/following/post counts + bio + name)
 *   Tier 3: Meta tags (og:title, og:image as backup)
 *
 * Input:  data/validated_creators.json OR config/seed-creators.json
 * Output: data/enriched_creators.json
 *
 * Throttle: 1 request/1.2 seconds (respectful, avoids rate limiting)
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
// Core: fetch a profile page and extract structured data
// ─────────────────────────────────────────────────────────

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Fetch a ShareChat public profile and extract structured data via 4-tier engine.
 *
 * @param {string} handle - ShareChat username
 * @param {string} [platform='sharechat'] - 'sharechat' or 'moj'
 * @param {Object} [opts] - options for extraction
 * @param {string} [opts.apiKey] - Anthropic API key for Tier 3 LLM extraction
 * @param {string} [opts.cacheDir] - path to data/ dir for enrichment cache
 * @param {boolean} [opts.llmCircuitOpen] - if true, skip Tier 3
 * @returns {Promise<Object>} Enriched profile data with extraction provenance
 */
async function scrapeProfile(handle, platform = 'sharechat', opts = {}) {
  const url = platform === 'moj'
    ? `https://mojapp.in/@${handle}`
    : `https://sharechat.com/profile/${handle}`;

  try {
    const resp = await fetchWithRetry(url, { redirect: 'follow' });
    if (!resp.ok) {
      return { handle, platform, error: `HTTP ${resp.status}`, enriched: false };
    }
    const html = await resp.text();
    const result = await extract(handle, platform, html, {
      apiKey: opts.apiKey,
      cacheDir: opts.cacheDir,
      llmCircuitOpen: opts.llmCircuitOpen || false,
    });

    // Save successful extractions to cache
    if (result.extractionTier > 0 && result.extractionTier < 4 && opts.cacheDir) {
      saveToCache(opts.cacheDir, handle, result);
    }

    // Collect snowball handles
    const snowball = extractSnowballHandles(html, platform, handle);

    return {
      ...result,
      enriched: result.extractionTier > 0,
      snowballHandles: snowball,
    };
  } catch (err) {
    return { handle, platform, error: err.message, enriched: false };
  }
}

// ─────────────────────────────────────────────────────────
// Merge enrichment data into candidate records
// ─────────────────────────────────────────────────────────

function mergeEnrichmentIntoCandidate(candidate, enrichment) {
  if (!enrichment.enriched) return candidate;

  const d = enrichment.data || enrichment;
  const bio = d.bio || candidate.bio || '';
  const contacts = parseContacts(bio);

  return {
    ...candidate,
    displayName: d.displayName || candidate.displayName,
    followerCount: d.followerCount || candidate.followerCount,
    followingCount: d.followingCount || candidate.followingCount,
    postCount: d.postCount || candidate.postCount,
    bio,
    isVerified: d.isVerified || candidate.isVerified,
    profilePictureUrl: enrichment.profilePictureUrl || candidate.profilePictureUrl,
    country: candidate.country || 'IN',
    source: candidate.source || 'manual_seed',
    profileExists: true,
    contacts,
    _extraction: {
      tier: enrichment.extractionTier,
      method: enrichment.extractionMethod,
      crossValidated: enrichment.crossValidated,
      stale: enrichment.stale,
      meta: enrichment._meta,
    },
    _snowballHandles: enrichment.snowballHandles || [],
  };
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────

async function main() {
  log('Starting ShareChat profile enrichment...');

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
      followerCount: null,
      followingCount: null,
      postCount: null,
      country: 'IN',
      language: s.language || null,
      platform: s.platform || 'sharechat',
      source: 'manual_seed',
      profileUrl: `https://sharechat.com/profile/${s.handle}`,
      seedNote: s.note || '',
    }));
    log(`Loaded ${candidates.length} from seed-creators.json`);
  }

  if (candidates.length === 0) {
    log('No candidates to enrich. Run validate-profiles.js or add seeds first.');
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
      if (c._extraction?.enrichedAt) {
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

    const platform = candidate.platform || 'sharechat';
    const enrichment = await scrapeProfile(handle, platform);

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
    platform: 'sharechat',
    totalCandidates: candidates.length,
    enrichedCount: enriched.filter(c => c._extraction).length,
    errorCount: errors.length,
    creators: enriched,
    errors,
  };

  writeFileSync(enrichedPath, JSON.stringify(output, null, 2));
  log(`Output: data/enriched_creators.json`);

  // Print summary table
  console.log('\n┌─────────────────────────┬──────────┬──────────┬─────────┐');
  console.log('│ Handle                  │ Follwrs  │ Posts    │ Bio     │');
  console.log('├─────────────────────────┼──────────┼──────────┼─────────┤');
  for (const c of enriched.filter(c => c._extraction)) {
    const handle = `@${c.username}`.padEnd(23);
    const followers = (c.followerCount ? formatNumber(c.followerCount) : '—').padEnd(8);
    const posts = (c.postCount?.toString() || '—').padStart(4) + ' posts ';
    const bio = (c.bio || '—').slice(0, 7).padEnd(7);
    console.log(`│ ${handle} │ ${followers} │ ${posts}│ ${bio} │`);
  }
  console.log('└─────────────────────────┴──────────┴──────────┴─────────┘');

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

// Only run main if this is the entry script (not imported)
const isMainScript = process.argv[1]?.includes('enrich-profiles');
if (isMainScript) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
