#!/usr/bin/env node

/**
 * Google Custom Search-based Discovery (pre-API bridge)
 *
 * Finds Snapchat public profiles in the grooming niche by querying Google
 * for site:snapchat.com/add pages with grooming keywords.
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
 * Extract Snapchat handles from Google search result URLs.
 */
function extractHandlesFromResults(results) {
  const handles = new Map();
  for (const result of results) {
    const match = result.url.match(HANDLE_REGEX);
    if (match) {
      const handle = match[1].toLowerCase();
      if (!handles.has(handle)) {
        handles.set(handle, {
          username: handle,
          displayName: result.title || handle,
          bio: '',
          subscriberCount: null,
          isVerified: null,
          country: 'IN', // search was India-targeted
          creatorCategory: '',
          profileUrl: `https://snapchat.com/add/${handle}`,
          spotlightMetrics: null,
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

  log(`Running ${SEARCH_QUERIES.length} Google searches for Snapchat grooming profiles...`);

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
