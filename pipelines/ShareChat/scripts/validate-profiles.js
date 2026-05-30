#!/usr/bin/env node

/**
 * Validate ShareChat handles via HTTP HEAD requests.
 * A 200 response to sharechat.com/profile/{handle} confirms the account exists.
 *
 * Only validates Google/seed candidates — tag-API-discovered creators skip validation.
 *
 * Input:  data/discovered_google.json + config/seed-creators.json
 * Output: data/validated_creators.json
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const CONFIG_DIR = join(ROOT, 'config');

function log(msg) {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${ts}] [validate] ${msg}`);
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Check if a ShareChat profile exists via HEAD request.
 */
async function checkProfileExists(handle, platform = 'sharechat') {
  const url = platform === 'moj'
    ? `https://mojapp.in/@${handle}`
    : `https://sharechat.com/profile/${handle}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });

    clearTimeout(timeout);
    return {
      exists: response.ok,
      status: response.status,
      redirected: response.redirected,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { exists: false, status: 0, error: 'timeout' };
    }
    return { exists: false, status: 0, error: err.message };
  }
}

/**
 * Load candidates that need HEAD validation (Google + seeds).
 */
function loadCandidatesForValidation() {
  const candidates = [];

  // Load Google-discovered
  const googlePath = join(DATA_DIR, 'discovered_google.json');
  if (existsSync(googlePath)) {
    const data = JSON.parse(readFileSync(googlePath, 'utf-8'));
    const googleCreators = data.creators || [];
    candidates.push(...googleCreators);
    log(`Loaded ${googleCreators.length} Google-discovered candidates`);
  }

  // Load manual seeds
  const seedPath = join(CONFIG_DIR, 'seed-creators.json');
  if (existsSync(seedPath)) {
    const data = JSON.parse(readFileSync(seedPath, 'utf-8'));
    const seeds = (data.seed_creators || []).map(s => ({
      username: s.handle,
      displayName: s.handle,
      bio: '',
      followerCount: null,
      followingCount: null,
      postCount: null,
      isVerified: null,
      country: 'IN',
      language: s.language || null,
      platform: s.platform || 'sharechat',
      profileUrl: (s.platform === 'moj')
        ? `https://mojapp.in/@${s.handle}`
        : `https://sharechat.com/profile/${s.handle}`,
      source: 'manual_seed',
      profileExists: null,
      googleSnippet: '',
      seedNote: s.note || '',
      discoveredAt: new Date().toISOString(),
    }));
    candidates.push(...seeds);
    log(`Loaded ${seeds.length} manual seeds`);
  }

  // Deduplicate by username
  const seen = new Map();
  for (const c of candidates) {
    const key = (c.username || c.handle || '').toLowerCase();
    if (key && !seen.has(key)) {
      seen.set(key, c);
    }
  }

  return [...seen.values()];
}

// ─────────────────────────────────────────────────────────
// Exports (for use in run-pipeline.js)
// ─────────────────────────────────────────────────────────

export { checkProfileExists, loadCandidatesForValidation };

async function main() {
  log('Starting ShareChat profile validation...');

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  const candidates = loadCandidatesForValidation();

  if (candidates.length === 0) {
    log('No candidates to validate. Run discover-google.js first or add seeds to config/seed-creators.json');
    return;
  }

  log(`Validating ${candidates.length} candidates via HEAD requests...`);

  const validated = [];
  const rejected = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    // Skip tag-API-discovered (already validated by API response)
    if (candidate.source === 'sharechat_tag_api') {
      validated.push({ ...candidate, profileExists: true });
      continue;
    }

    // Throttle: 1 request per second
    if (i > 0) await new Promise(r => setTimeout(r, 1000));

    const handle = candidate.username || candidate.handle;
    const platform = candidate.platform || 'sharechat';
    process.stdout.write(`\r[validate] ${i + 1}/${candidates.length}: @${handle} (${platform})...`);

    const result = await checkProfileExists(handle, platform);

    if (result.exists) {
      validated.push({
        ...candidate,
        profileExists: true,
        validatedAt: new Date().toISOString(),
      });
    } else {
      rejected.push({
        handle,
        platform,
        reason: result.error || `HTTP ${result.status}`,
        source: candidate.source,
      });
    }
  }

  console.log();
  log(`Validation complete: ${validated.length} exist, ${rejected.length} rejected`);

  const output = {
    generatedAt: new Date().toISOString(),
    platform: 'sharechat',
    inputCount: candidates.length,
    validatedCount: validated.length,
    rejectedCount: rejected.length,
    creators: validated,
    rejected,
  };

  writeFileSync(join(DATA_DIR, 'validated_creators.json'), JSON.stringify(output, null, 2));
  log(`Output: data/validated_creators.json`);

  if (rejected.length > 0) {
    log(`Rejected (${rejected.length}):`);
    for (const r of rejected.slice(0, 10)) {
      log(`  @${r.handle} (${r.platform}) — ${r.reason} (${r.source})`);
    }
    if (rejected.length > 10) log(`  ... and ${rejected.length - 10} more`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
