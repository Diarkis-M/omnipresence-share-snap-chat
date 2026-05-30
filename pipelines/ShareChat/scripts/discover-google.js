#!/usr/bin/env node

/**
 * Google Custom Search-based Discovery for ShareChat/Moj creators.
 *
 * Finds ShareChat public profiles in the grooming niche by querying Google
 * for site:sharechat.com/profile pages with grooming keywords.
 * Also searches for Moj creators via site:mojapp.in.
 *
 * Requires: GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX
 * Free tier: 100 queries/day
 *
 * Output: data/discovered_google.json (fresh each run, no merge)
 */

import 'dotenv/config';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

function log(msg) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [discover-google] ${msg}`);
}

// ─────────────────────────────────────────────────────────
// ShareChat-specific search queries (10 queries, fits free tier)
// ─────────────────────────────────────────────────────────

const SEARCH_QUERIES = [
  'site:sharechat.com/profile beard grooming India',
  'site:sharechat.com/profile mens grooming India',
  'site:sharechat.com/profile skincare men India',
  'site:sharechat.com/profile hairstyle barber India',
  'site:sharechat.com/profile perfume fragrance India',
  '"sharechat" "men\'s grooming" India influencer',
  '"sharechat" "beard care" India creator',
  '"sharechat" grooming tips Hindi',
  '"moj" "mens grooming" India creator',
  'site:mojapp.in grooming beard India',
];

// ─────────────────────────────────────────────────────────
// Handle extraction regexes
// ─────────────────────────────────────────────────────────

const SHARECHAT_HANDLE_REGEX = /sharechat\.com\/profile\/([a-zA-Z0-9._-]{3,50})/i;
const MOJ_HANDLE_REGEX = /mojapp\.in\/@([a-zA-Z0-9._-]{3,50})/i;

/**
 * Perform a Google Custom Search API query.
 */
async function googleSearch(query, apiKey, cseId) {
  const url = new URL('https://www.googleapis.com/customsearch/v1');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx', cseId);
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10');

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google CSE error ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return (data.items || []).map(item => ({
    url: item.link,
    title: item.title,
    snippet: item.snippet,
  }));
}

/**
 * Extract ShareChat/Moj handles from Google search result URLs.
 */
function extractHandlesFromResults(results) {
  const handles = new Map();

  for (const result of results) {
    // Try ShareChat profile URL first
    let match = result.url.match(SHARECHAT_HANDLE_REGEX);
    let platform = 'sharechat';

    // Fall back to Moj URL
    if (!match) {
      match = result.url.match(MOJ_HANDLE_REGEX);
      platform = 'moj';
    }

    if (match) {
      const handle = match[1].toLowerCase();
      if (!handles.has(handle)) {
        handles.set(handle, {
          username: handle,
          displayName: result.title || handle,
          bio: '',
          followerCount: null,
          followingCount: null,
          postCount: null,
          isVerified: null,
          country: 'IN', // search was India-targeted
          language: null, // unknown until enrichment
          platform,
          profileUrl: platform === 'sharechat'
            ? `https://sharechat.com/profile/${handle}`
            : `https://mojapp.in/@${handle}`,
          source: 'google_cse',
          profileExists: null, // needs HEAD validation
          googleSnippet: result.snippet || '',
          googleTitle: result.title || '',
          discoveredAt: new Date().toISOString(),
        });
      }
    }
  }

  return [...handles.values()];
}

// ─────────────────────────────────────────────────────────
// Exports (for use in run-pipeline.js)
// ─────────────────────────────────────────────────────────

export { googleSearch, extractHandlesFromResults, SEARCH_QUERIES };

async function main() {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_CX;

  if (!apiKey || !cseId) {
    log('GOOGLE_CSE_API_KEY and GOOGLE_CSE_CX not set — running in dry-run mode');
    log(`Would search ${SEARCH_QUERIES.length} queries:`);
    for (const q of SEARCH_QUERIES) log(`  "${q}"`);
    return;
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  log(`Running ${SEARCH_QUERIES.length} Google searches for ShareChat/Moj grooming profiles...`);

  const allCreators = new Map();

  for (let i = 0; i < SEARCH_QUERIES.length; i++) {
    const query = SEARCH_QUERIES[i];
    log(`[${i + 1}/${SEARCH_QUERIES.length}] ${query.slice(0, 60)}...`);

    try {
      const results = await googleSearch(query, apiKey, cseId);
      const creators = extractHandlesFromResults(results);
      for (const c of creators) {
        if (!allCreators.has(c.username)) {
          allCreators.set(c.username, c);
        }
      }
      log(`  Found ${creators.length} handles (${allCreators.size} total unique)`);
    } catch (err) {
      log(`  Error: ${err.message}`);
    }

    // Rate limit: ~1 query/second
    if (i < SEARCH_QUERIES.length - 1) {
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'google_cse',
    platform: 'sharechat',
    queriesRun: SEARCH_QUERIES.length,
    totalCreators: allCreators.size,
    creators: [...allCreators.values()],
  };

  writeFileSync(join(DATA_DIR, 'discovered_google.json'), JSON.stringify(output, null, 2));
  log(`Done. ${allCreators.size} unique handles discovered`);
  log('Output: data/discovered_google.json');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
