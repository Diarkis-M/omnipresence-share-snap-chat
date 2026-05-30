/**
 * 4-Tier Adaptive Extraction Engine for Snapchat profiles.
 *
 * Tier 1: Standards-based (__NEXT_DATA__ SSR JSON) — FREE, most stable
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
 * @param {string} handle - Snapchat username
 * @param {string} platform - 'snapchat'
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

  // ── Tier 1: __NEXT_DATA__ SSR JSON ──
  const tier1 = extractNextData(html);
  if (tier1 && validate(tier1)) {
    meta.tier1Result = 'success';
    return buildResult(handle, platform, 1, 'next_data', tier1, meta, true);
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
    data: {
      displayName: handle, subscriberCount: null, bio: '', isVerified: false,
      creatorCategory: '', spotlightVideoCount: 0, spotlightHashtags: [],
      address: '', websiteUrl: '',
    },
    _meta: meta, error: 'All extraction tiers failed',
  };
}

// ─── Tier 1: __NEXT_DATA__ SSR JSON ───

const NEXT_DATA_RE = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/;

function extractNextData(html) {
  const match = html.match(NEXT_DATA_RE);
  if (!match) return null;

  try {
    const nextData = JSON.parse(match[1]);
    const pp = nextData.props?.pageProps;
    if (!pp) return null;

    const profile = pp.userProfile?.publicProfileInfo;
    if (!profile) return null;

    const data = {
      displayName: profile.title || profile.username || null,
      subscriberCount: parseInt(profile.subscriberCount, 10) || null,
      bio: profile.bio || '',
      isVerified: (profile.badge || 0) > 0,
      creatorCategory: profile.categoryStringId || '',
      address: profile.address || '',
      websiteUrl: profile.websiteUrl || '',
      profilePictureUrl: profile.profilePictureUrl || '',
      hasStory: !!profile.hasStory,
      publisherType: profile.publisherType || '',
    };

    // Timestamps
    if (profile.creationTimestampMs?.value) {
      data.createdAt = new Date(parseInt(profile.creationTimestampMs.value, 10)).toISOString();
    }
    if (profile.lastUpdateTimestampMs?.value) {
      data.lastUpdatedAt = new Date(parseInt(profile.lastUpdateTimestampMs.value, 10)).toISOString();
    }

    // Spotlight data
    const spotlightHighlights = pp.spotlightHighlights;
    data.spotlightVideoCount = Array.isArray(spotlightHighlights)
      ? spotlightHighlights.length : 0;

    // Spotlight metadata (titles, descriptions, upload dates, hashtags)
    const spotlightMeta = pp.spotlightStoryMetadata;
    if (Array.isArray(spotlightMeta)) {
      const videos = spotlightMeta
        .filter(s => s.videoMetadata)
        .map(s => ({
          title: s.videoMetadata.name || '',
          description: s.videoMetadata.description || '',
          uploadedAt: s.videoMetadata.uploadDateMs
            ? new Date(parseInt(s.videoMetadata.uploadDateMs, 10)).toISOString()
            : null,
          viewCount: parseInt(s.videoMetadata.viewCount, 10) || 0,
        }));

      data.spotlightVideos = videos;

      // Extract hashtags
      const allHashtags = new Set();
      for (const v of videos) {
        const tags = v.description.match(/#\w+/g);
        if (tags) tags.forEach(t => allHashtags.add(t.toLowerCase()));
      }
      data.spotlightHashtags = [...allHashtags];

      // Compute avg views
      if (videos.length > 0) {
        const totalViews = videos.reduce((sum, v) => sum + v.viewCount, 0);
        data.avgViewsPerVideo = Math.round(totalViews / videos.length);
        data.totalViews = totalViews;
      }

      // Posting frequency
      const uploadDates = videos
        .map(v => v.uploadedAt)
        .filter(Boolean)
        .map(d => new Date(d).getTime())
        .sort();

      if (uploadDates.length >= 2) {
        const rangeMs = uploadDates[uploadDates.length - 1] - uploadDates[0];
        const rangeDays = rangeMs / (1000 * 60 * 60 * 24);
        data.spotlightPostingFrequency = {
          videoCount: uploadDates.length,
          spanDays: Math.round(rangeDays),
          avgDaysBetweenPosts: rangeDays > 0
            ? Math.round((rangeDays / (uploadDates.length - 1)) * 10) / 10
            : 0,
        };
      }
    } else {
      data.spotlightHashtags = [];
    }

    // Story data
    const story = pp.story;
    if (story?.snapList) {
      data.storySnapCount = story.snapList.length;
    }

    return data;
  } catch { return null; }
}

// ─── Tier 2: Regex ───

function extractWithRegex(html) {
  const data = {
    displayName: null, subscriberCount: null, bio: '', isVerified: false,
    creatorCategory: '', spotlightVideoCount: 0, spotlightHashtags: [],
  };

  // Subscriber count from meta tags or page content
  const subsMatch = html.match(/subscriberCount["':]\s*["']?(\d[\d,]*)/);
  if (subsMatch) data.subscriberCount = parseCount(subsMatch[1]);

  // Fallback: "X Subscribers" text pattern
  if (!data.subscriberCount) {
    const subsText = html.match(/([\d,]+)\s+Subscriber/i);
    if (subsText) data.subscriberCount = parseCount(subsText[1]);
  }

  // Display name from og:title or page content
  const ogTitle = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"/);
  if (ogTitle) {
    // Snapchat format: "Display Name (@username) | Snapchat"
    const nameMatch = ogTitle[1].match(/^(.+?)\s*\(@/);
    if (nameMatch) data.displayName = nameMatch[1].trim();
  }

  // Bio from og:description or bio field
  const bioMatch = html.match(/bio["':]\s*["']([^"']{1,500})/);
  if (bioMatch) {
    data.bio = bioMatch[1].trim();
  } else {
    const ogDesc = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"/);
    if (ogDesc && ogDesc[1].length > 5) {
      data.bio = ogDesc[1].trim();
    }
  }

  // Verified badge
  if (html.includes('"badge":') || html.includes('is_verified')) {
    const badgeMatch = html.match(/badge["':]\s*(\d+)/);
    if (badgeMatch && parseInt(badgeMatch[1]) > 0) data.isVerified = true;
  }

  // Category
  const catMatch = html.match(/categoryStringId["':]\s*["']([^"']+)/);
  if (catMatch) data.creatorCategory = catMatch[1];

  // Spotlight video count — count occurrences of videoMetadata
  const videoMetaMatches = html.match(/videoMetadata/g);
  if (videoMetaMatches) data.spotlightVideoCount = videoMetaMatches.length;

  return (data.subscriberCount || data.spotlightVideoCount > 0) ? data : null;
}

// ─── Cross-validation ───

function crossValidate(extracted, lastKnown) {
  if (!extracted || !lastKnown) return { passed: true, reason: 'no_baseline' };

  const last = lastKnown.data;

  // Asymmetric: drops are suspicious, growth is normal
  if (last.subscriberCount && last.subscriberCount > 0) {
    if (extracted.subscriberCount === 0 || extracted.subscriberCount === null) {
      return { passed: false, reason: 'subscriber_count_dropped_to_zero' };
    }
    const ratio = extracted.subscriberCount / last.subscriberCount;
    if (ratio < 0.4) {  // dropped by >60%
      return { passed: false, reason: `subscriber_count_drop_${Math.round((1 - ratio) * 100)}%` };
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
  // Strip __NEXT_DATA__ script (already parsed in Tier 1)
  cleaned = cleaned.replace(/<script id="__NEXT_DATA__"[\s\S]*?<\/script>/gi, '');
  // Strip other scripts
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
    (typeof data.subscriberCount === 'number' && data.subscriberCount > 0) ||
    (typeof data.spotlightVideoCount === 'number' && data.spotlightVideoCount > 0)
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
      subscriberCount: data.subscriberCount || null,
      bio: data.bio || '',
      isVerified: data.isVerified || false,
      creatorCategory: data.creatorCategory || '',
      spotlightVideoCount: data.spotlightVideoCount || 0,
      spotlightHashtags: data.spotlightHashtags || [],
      spotlightVideos: data.spotlightVideos || undefined,
      avgViewsPerVideo: data.avgViewsPerVideo || 0,
      totalViews: data.totalViews || 0,
      spotlightPostingFrequency: data.spotlightPostingFrequency || null,
      address: data.address || '',
      websiteUrl: data.websiteUrl || '',
      profilePictureUrl: data.profilePictureUrl || '',
      hasStory: data.hasStory || false,
      storySnapCount: data.storySnapCount || 0,
      createdAt: data.createdAt || null,
      lastUpdatedAt: data.lastUpdatedAt || null,
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

// ─── Snowball: extract other Snapchat profile handles from page ───

export function extractSnowballHandles(html, platform, currentHandle) {
  const handles = new Set();
  const pattern = /snapchat\.com\/add\/([a-zA-Z0-9._-]{3,30})/gi;

  let match;
  while ((match = pattern.exec(html)) !== null) {
    const h = match[1].toLowerCase();
    if (h !== currentHandle.toLowerCase() && !['add', 'download', 'login', 'signup', 'stories'].includes(h)) {
      handles.add(h);
    }
  }

  // Cap at 20 per profile
  return [...handles].slice(0, 20);
}
