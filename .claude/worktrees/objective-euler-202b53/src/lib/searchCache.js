/**
 * Search Cache — avoids re-burning YouTube API quota on identical searches.
 *
 * Uses a simple in-memory Map (server-side, lives per Next.js server instance)
 * plus localStorage on the client for cross-page-refresh persistence.
 *
 * Cache key = hash of search parameters (category, subscriber range, languages, etc.)
 * TTL = 30 minutes (YouTube data doesn't change that fast)
 */

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Server-side in-memory cache (for API route) ──
const memoryCache = new Map();

/**
 * Generate a deterministic cache key from search params.
 */
export function getCacheKey(params) {
  const normalized = {
    category: params.category || '',
    subscriberRange: params.subscriberRange || 'micro',
    contentTypes: (params.contentTypes || []).sort().join(','),
    languages: (params.languages || []).sort().join(','),
    videoFormat: params.videoFormat || 'mixed',
    maxResults: params.maxResults || 5,
  };
  return `scout:${JSON.stringify(normalized)}`;
}

/**
 * Check if a cached result exists and is still fresh.
 * Returns the cached data or null.
 */
export function getFromCache(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Store search results in cache.
 */
export function setInCache(key, data) {
  memoryCache.set(key, {
    data,
    timestamp: Date.now(),
  });

  // Evict oldest entries if cache grows too large (keep max 20 searches)
  if (memoryCache.size > 20) {
    const oldest = [...memoryCache.entries()].sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    memoryCache.delete(oldest[0][0]);
  }
}

/**
 * Get cache stats for debugging / UI display.
 */
export function getCacheStats() {
  const now = Date.now();
  let active = 0;
  let expired = 0;

  memoryCache.forEach((entry) => {
    if (now - entry.timestamp > CACHE_TTL_MS) expired++;
    else active++;
  });

  return { active, expired, total: memoryCache.size };
}

/**
 * Clear the entire cache.
 */
export function clearCache() {
  memoryCache.clear();
}
