#!/usr/bin/env node

/**
 * Snap API Creator Discovery
 *
 * Two strategies:
 *   1. Targeted keyword queries — grooming keywords × India × follower range
 *   2. Broad sweep by tier — ALL Indian creators per subscriber tier
 *
 * Requires: SNAP_CLIENT_ID and SNAP_CLIENT_SECRET
 * Output: data/discovered_api.json
 *
 * Usage:
 *   node scripts/discover-api.js                          # both strategies
 *   node scripts/discover-api.js --keywords-only           # strategy 1 only
 *   node scripts/discover-api.js --broad-only              # strategy 2 only
 *   node scripts/discover-api.js --tier micro              # single tier sweep
 *   node scripts/discover-api.js --max-per-tier 200        # cap results per tier
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { isSnapApiConfigured, discoverCreators, SNAP_SUBSCRIBER_TIERS } from '../src/lib/snap-api-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const CONFIG_DIR = join(ROOT, 'config');

function log(msg) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [discover-api] ${msg}`);
}

// Parse CLI args
const args = process.argv.slice(2);
const keywordsOnly = args.includes('--keywords-only');
const broadOnly = args.includes('--broad-only');
const singleTierArg = args.find((_, i) => args[i - 1] === '--tier');
const maxPerTierArg = args.find((_, i) => args[i - 1] === '--max-per-tier');
const maxPerTier = maxPerTierArg ? parseInt(maxPerTierArg, 10) : 500;

/**
 * Paginate through all results for a given discovery query.
 * Caps at maxResults to control cost.
 */
async function paginateDiscovery(queryParams, maxResults) {
  const all = [];
  let cursor = undefined;
  let page = 0;

  while (all.length < maxResults) {
    page++;
    const { creators, nextCursor } = await discoverCreators({ ...queryParams, cursor });
    all.push(...creators);
    log(`  Page ${page}: ${creators.length} creators (${all.length} total)`);

    if (!nextCursor || creators.length === 0) break;
    cursor = nextCursor;

    // Rate limit: ~1 request/second
    await new Promise(r => setTimeout(r, 1000));
  }

  return all.slice(0, maxResults);
}

/**
 * Strategy 1: Targeted keyword queries.
 * Search for creators with grooming-related usernames/display names in India.
 */
async function runKeywordDiscovery() {
  log('Strategy 1: Targeted keyword queries');

  // Load grooming keywords
  const keywordsPath = join(CONFIG_DIR, 'grooming-keywords.json');
  if (!existsSync(keywordsPath)) {
    log('No grooming-keywords.json found — skipping keyword discovery');
    return [];
  }

  const kwConfig = JSON.parse(readFileSync(keywordsPath, 'utf-8'));
  const keywords = kwConfig.generic_relevance_terms || [];

  log(`Querying ${keywords.length} grooming keywords...`);

  const all = new Map();
  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    log(`[${i + 1}/${keywords.length}] query="${keyword}"`);

    try {
      const creators = await paginateDiscovery({
        countryCodes: ['IN'],
        query: keyword,
        minFollowers: 500,
        limit: 50,
      }, 200); // cap 200 per keyword

      for (const c of creators) {
        if (!all.has(c.username)) {
          all.set(c.username, { ...c, discoveryKeyword: keyword });
        }
      }

      log(`  → ${all.size} unique creators so far`);
    } catch (err) {
      log(`  Error: ${err.message}`);
    }

    // Rate limit between keywords
    if (i < keywords.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  return [...all.values()];
}

/**
 * Strategy 2: Broad sweep by subscriber tier.
 * Discover ALL Indian creators within each tier, let Haiku filter later.
 */
async function runBroadSweep() {
  log('Strategy 2: Broad sweep by subscriber tier');

  const tiers = singleTierArg
    ? { [singleTierArg]: SNAP_SUBSCRIBER_TIERS[singleTierArg] }
    : SNAP_SUBSCRIBER_TIERS;

  const all = new Map();

  for (const [tierName, range] of Object.entries(tiers)) {
    if (!range) {
      log(`Unknown tier: ${tierName} — skipping`);
      continue;
    }

    const maxFollowers = range.max === Infinity ? undefined : range.max;
    log(`Tier ${tierName} (${range.min}-${maxFollowers || '∞'} subscribers)`);

    try {
      const creators = await paginateDiscovery({
        countryCodes: ['IN'],
        minFollowers: range.min,
        maxFollowers: maxFollowers,
        limit: 50,
      }, maxPerTier);

      for (const c of creators) {
        if (!all.has(c.username)) {
          all.set(c.username, { ...c, discoveryTier: tierName });
        }
      }

      log(`  → ${all.size} unique creators so far`);
    } catch (err) {
      log(`  Error for tier ${tierName}: ${err.message}`);
    }

    // Rate limit between tiers
    await new Promise(r => setTimeout(r, 2000));
  }

  return [...all.values()];
}

async function main() {
  if (!isSnapApiConfigured()) {
    log('SNAP_CLIENT_ID and SNAP_CLIENT_SECRET not set — cannot run API discovery');
    log('Set these env vars after receiving API approval from Snap');
    log('Use discover-google.js as pre-API bridge in the meantime');
    process.exit(0);
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const allCreators = new Map();
  const startTime = Date.now();

  // Strategy 1: Keyword queries
  if (!broadOnly) {
    const keywordResults = await runKeywordDiscovery();
    for (const c of keywordResults) {
      if (!allCreators.has(c.username)) allCreators.set(c.username, c);
    }
    log(`After keyword discovery: ${allCreators.size} unique creators`);
  }

  // Strategy 2: Broad sweep
  if (!keywordsOnly) {
    const broadResults = await runBroadSweep();
    for (const c of broadResults) {
      if (!allCreators.has(c.username)) allCreators.set(c.username, c);
    }
    log(`After broad sweep: ${allCreators.size} unique creators`);
  }

  // Write output
  const output = {
    generatedAt: new Date().toISOString(),
    source: 'snap_api',
    totalCreators: allCreators.size,
    strategies: {
      keywordQueries: !broadOnly,
      broadSweep: !keywordsOnly,
      maxPerTier,
      singleTier: singleTierArg || null,
    },
    creators: [...allCreators.values()],
  };

  writeFileSync(join(DATA_DIR, 'discovered_api.json'), JSON.stringify(output, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Done. ${allCreators.size} creators discovered in ${elapsed}s`);
  log('Output: data/discovered_api.json');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
