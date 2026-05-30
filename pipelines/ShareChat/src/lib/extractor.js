/**
 * 4-Tier Adaptive Extraction Engine for ShareChat profiles.
 *
 * Tier 1: Standards-based (JSON-LD) — FREE, most stable
 * Tier 2: Regex with cross-validation — FREE, catches drift
 * Tier 3: LLM via Haiku — ~$0.002, adapts to any HTML change
 * Tier 4: Cached data fallback — FREE, stale but non-zero
 *
 * Cross-validation compares regex results against last-known-good values.
 * Asymmetric thresholds: growth is normal, drops are suspicious.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { extractProfileWithLLM } from './anthropic.js';

/**
 * Extract profile data using the 4-tier adaptive chain.
 *
 * @param {string} handle - ShareChat username
 * @param {string} platform - 'sharechat' or 'moj'
 * @param {string} html - raw HTML of the profile page
 * @param {Object} opts
 * @param {string} [opts.apiKey] - Anthropic API key (needed for Tier 3)
 * @param {string} [opts.cacheDir] - path to data/ dir for enrichment cache
 * @param {boolean} [opts.llmCircuitOpen=false] - if true, skip Tier 3
 * @returns {Promise<Object>} Extraction result with provenance metadata
 */
export async function extract(handle, platform, html, opts = {}) {
  const { apiKey, cacheDir, llmCircuitOpen = false } = opts;
  const meta = {
    extractedAt: new Date().toISOString(),
    htmlSize: html.length,
    cleanedHtmlSize: 0,
    tier1Result: null,
    tier2Result: null,
    tier3Result: null,
    tier4Result: null,
  };

  // Load last-known-good for cross-validation
  const lastKnown = cacheDir ? loadCache(cacheDir, handle) : null;

  // ── Tier 1: Standards-based (JSON-LD) ──
  const tier1 = extractJsonLd(html);
  if (tier1 && validate(tier1)) {
    // Supplement with bio/stats from HTML since JSON-LD doesn't include them
    const supplement = extractWithRegex(html);
    if (supplement) {
      if (!tier1.bio && supplement.bio) tier1.bio = supplement.bio;
      if (!tier1.followingCount && supplement.followingCount) tier1.followingCount = supplement.followingCount;
      if (!tier1.postCount && supplement.postCount) tier1.postCount = supplement.postCount;
      if (!tier1.displayName && supplement.displayName) tier1.displayName = supplement.displayName;
    }
    meta.tier1Result = 'success';
    return buildResult(handle, platform, 1, 'json_ld', tier1, meta, true);
  }
  meta.tier1Result = tier1 ? 'failed:validation' : 'failed:not_found';

  // ── Tier 2: Regex with cross-validation ──
  const tier2 = extractWithRegex(html);
  const crossVal = crossValidate(tier2, lastKnown);
  if (tier2 && validate(tier2) && crossVal.passed) {
    meta.tier2Result = 'success';
    return buildResult(handle, platform, 2, 'regex', tier2, meta, true);
  }
  meta.tier2Result = crossVal.passed
    ? (tier2 ? 'failed:validation' : 'failed:no_data')
    : `suspicious:${crossVal.reason}`;

  // ── Tier 3: LLM extraction ──
  if (apiKey && !llmCircuitOpen) {
    const cleaned = cleanHtml(html);
    meta.cleanedHtmlSize = cleaned.length;
    const tier3 = await extractProfileWithLLM(cleaned, platform, apiKey);
    if (tier3 && !tier3.error && validate(tier3)) {
      meta.tier3Result = 'success';
      return buildResult(handle, platform, 3, 'llm_haiku', tier3, meta, false);
    }
    meta.tier3Result = tier3?.error || 'failed:validation';
  } else {
    meta.tier3Result = llmCircuitOpen ? 'skipped:circuit_open' : 'skipped:no_api_key';
  }

  // ── Tier 4: Cached data ──
  if (lastKnown) {
    meta.tier4Result = 'success:stale_data';
    return buildResult(handle, platform, 4, 'cache', lastKnown.data, meta, false, true);
  }
  meta.tier4Result = 'failed:no_cache';

  // All tiers failed
  return {
    handle, platform, extractionTier: 0, extractionMethod: 'none',
    crossValidated: false, stale: false,
    data: { displayName: handle, followerCount: null, followingCount: null, postCount: null, bio: '', isVerified: false, language: null },
    _meta: meta, error: 'All extraction tiers failed',
  };
}

// ─── Tier 1: JSON-LD ───

function extractJsonLd(html) {
  const match = html.match(/<script[^>]*type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const ld = JSON.parse(match[1]);
    if (ld['@type'] !== 'Person') return null;
    let followerCount = null;
    if (Array.isArray(ld.interactionStatistic)) {
      for (const stat of ld.interactionStatistic) {
        if ((stat.interactionType?.['@type'] || '').includes('FollowAction')) {
          followerCount = parseCount(stat.userInteractionCount);
        }
      }
    }
    return {
      displayName: ld.name || null,
      followerCount,
      followingCount: null, // JSON-LD doesn't include this
      postCount: null,       // JSON-LD doesn't include this
      bio: '',
      isVerified: false,
      language: null,
    };
  } catch { return null; }
}

// ─── Tier 2: Regex ───

function extractWithRegex(html) {
  const data = {
    displayName: null, followerCount: null, followingCount: null,
    postCount: null, bio: '', isVerified: false, language: null,
  };

  // Language-agnostic URL-based extraction
  const fMatch = html.match(/\/followers"><div[^>]*>(\d[\d,.]*(?:\s*[KkMm])?)<\/div>/);
  if (fMatch) data.followerCount = parseCount(fMatch[1]);

  const foMatch = html.match(/\/following"><div[^>]*>(\d[\d,.]*(?:\s*[KkMm])?)<\/div>/);
  if (foMatch) data.followingCount = parseCount(foMatch[1]);

  const pMatch = html.match(/\/following">[\s\S]{1,300}?<\/a><div[^>]*><div[^>]*>(\d[\d,.]*(?:\s*[KkMm])?)<\/div>/);
  if (pMatch) data.postCount = parseCount(pMatch[1]);

  // English label fallbacks
  if (!data.followerCount) {
    const en = html.match(/>(\d[\d,.]*(?:[KkMm])?)<\/div><div[^>]*>Followers<\/div>/);
    if (en) data.followerCount = parseCount(en[1]);
  }
  if (!data.followingCount) {
    const en = html.match(/>(\d[\d,.]*(?:[KkMm])?)<\/div><div[^>]*>Following<\/div>/);
    if (en) data.followingCount = parseCount(en[1]);
  }
  if (!data.postCount) {
    const en = html.match(/>(\d[\d,.]*(?:[KkMm])?)<\/div><div[^>]*>Posts<\/div>/);
    if (en) data.postCount = parseCount(en[1]);
  }

  // Display name
  const nameMatch = html.match(/<div class="[^"]*Fw[^"]*"[^>]*>([^<]+)<\/div><div[^>]*><span[^>]*>@/);
  if (nameMatch) data.displayName = nameMatch[1].trim();

  // Bio — CSS class pattern
  const bioMatch = html.match(/Py\(\$sm\)\s+Mb\(\$xxs\)\s+Fw\(\$fwcaption\)\s+C\(\$secondaryDark\)[^"]*"[^>]*>([^<]{1,500})<\/div>/);
  if (bioMatch) {
    const bio = bioMatch[1].trim();
    if (bio.length > 1 && !bio.startsWith('Follow') && !bio.startsWith('Edit')) {
      data.bio = bio;
    }
  }

  // Meta tag fallbacks
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/);
  if (ogTitle && !data.displayName) {
    const m = ogTitle[1].match(/^(.+?)\s*\(@/);
    if (m) data.displayName = m[1].trim();
  }

  return (data.followerCount || data.postCount) ? data : null;
}

// ─── Cross-validation ───

function crossValidate(extracted, lastKnown) {
  if (!extracted || !lastKnown) return { passed: true, reason: 'no_baseline' };

  const last = lastKnown.data;

  // Asymmetric: drops are suspicious, growth is normal
  if (last.followerCount && last.followerCount > 0) {
    if (extracted.followerCount === 0 || extracted.followerCount === null) {
      return { passed: false, reason: 'follower_count_dropped_to_zero' };
    }
    const ratio = extracted.followerCount / last.followerCount;
    if (ratio < 0.4) {  // dropped by >60%
      return { passed: false, reason: `follower_count_drop_${Math.round((1 - ratio) * 100)}%` };
    }
  }

  // Bio disappeared
  if (last.bio && last.bio.length > 5 && (!extracted.bio || extracted.bio.length === 0)) {
    return { passed: false, reason: 'bio_disappeared' };
  }

  return { passed: true, reason: 'within_tolerance' };
}

// ─── HTML cleaning for LLM ───

function cleanHtml(html) {
  let cleaned = html;
  // Strip script tags (except JSON-LD — already parsed)
  cleaned = cleaned.replace(/<script[^>]*type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Strip styles
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<link[^>]*rel="stylesheet"[^>]*>/gi, '');
  // Strip nav, footer, header, iframe
  cleaned = cleaned.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  cleaned = cleaned.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  cleaned = cleaned.replace(/<header[\s\S]*?<\/header>/gi, '');
  cleaned = cleaned.replace(/<iframe[\s\S]*?<\/iframe>/gi, '');
  // Strip HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  // Strip data-* attributes and inline styles (noise for LLM)
  cleaned = cleaned.replace(/\s+data-[a-z-]+="[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s+style="[^"]*"/gi, '');
  // Collapse whitespace
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  return cleaned;
}

// ─── Cache management ───

function loadCache(cacheDir, handle) {
  const cachePath = join(cacheDir, 'enrichment_cache.json');
  if (!existsSync(cachePath)) return null;
  try {
    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    return cache[handle.toLowerCase()] || null;
  } catch { return null; }
}

export function saveToCache(cacheDir, handle, extractionResult) {
  const cachePath = join(cacheDir, 'enrichment_cache.json');
  let cache = {};
  try {
    if (existsSync(cachePath)) {
      cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    }
  } catch { cache = {}; }
  cache[handle.toLowerCase()] = {
    data: extractionResult.data,
    tier: extractionResult.extractionTier,
    savedAt: new Date().toISOString(),
  };
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

// ─── Utilities ───

function validate(data) {
  return data && (
    (typeof data.followerCount === 'number' && data.followerCount > 0) ||
    (typeof data.postCount === 'number' && data.postCount > 0)
  );
}

function buildResult(handle, platform, tier, method, data, meta, crossValidated, stale = false) {
  return {
    handle, platform,
    extractionTier: tier,
    extractionMethod: method,
    crossValidated,
    stale,
    staleSince: stale ? meta.extractedAt : null,
    data: {
      displayName: data.displayName || handle,
      followerCount: data.followerCount || null,
      followingCount: data.followingCount || null,
      postCount: data.postCount || null,
      bio: data.bio || '',
      isVerified: data.isVerified || false,
      language: data.language || null,
    },
    _meta: meta,
  };
}

function parseCount(str) {
  if (!str) return null;
  const cleaned = str.replace(/,/g, '').trim();
  const kMatch = cleaned.match(/^([\d.]+)\s*[Kk]$/);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const mMatch = cleaned.match(/^([\d.]+)\s*[Mm]$/);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

// ─── Snowball: extract other profile handles from page ───

export function extractSnowballHandles(html, platform, currentHandle) {
  const handles = new Set();
  const pattern = platform === 'moj'
    ? /mojapp\.in\/@([a-zA-Z0-9._-]{3,50})/gi
    : /sharechat\.com\/profile\/([a-zA-Z0-9._-]{3,50})/gi;

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const h = match[1].toLowerCase();
    // Exclude current handle and common non-profile paths
    if (h !== currentHandle.toLowerCase() && !['followers', 'following', 'settings', 'login', 'signup'].includes(h)) {
      handles.add(h);
    }
  }

  // Cap at 20 per profile
  return [...handles].slice(0, 20);
}
