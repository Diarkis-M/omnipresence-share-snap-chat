/**
 * Official Snapchat Public Profile API client.
 * Creator Discovery endpoint + single profile lookup.
 *
 * Endpoint: developers.snap.com/api/marketing-api/Public-Profile-API/CreatorDiscovery
 * Auth: OAuth 2.0 (client credentials flow)
 *
 * Inactive until API access is approved (2-6 week wait after application).
 */

const SNAP_API_BASE = 'https://adsapi.snapchat.com/v1';
const SNAP_AUTH_URL = 'https://accounts.snapchat.com/login/oauth2/access_token';

let _accessToken = null;
let _tokenExpiresAt = 0;

/**
 * Check if Snap API credentials are configured.
 */
export function isSnapApiConfigured() {
  return !!(process.env.SNAP_CLIENT_ID && process.env.SNAP_CLIENT_SECRET);
}

/**
 * Get OAuth 2.0 access token using client credentials flow.
 * Caches the token until 60s before expiry.
 */
async function getAccessToken() {
  if (_accessToken && Date.now() < _tokenExpiresAt - 60000) {
    return _accessToken;
  }

  const clientId = process.env.SNAP_CLIENT_ID;
  const clientSecret = process.env.SNAP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('SNAP_CLIENT_ID and SNAP_CLIENT_SECRET required');
  }

  const response = await fetch(SNAP_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!response.ok) {
    throw new Error(`Snap OAuth failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  _accessToken = data.access_token;
  _tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return _accessToken;
}

/**
 * Make an authenticated API request with retry + exponential backoff.
 */
async function snapApiRequest(path, params = {}) {
  const token = await getAccessToken();
  const url = new URL(`${SNAP_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5', 10);
      const backoff = retryAfter * 1000 * (attempt + 1);
      await new Promise(r => setTimeout(r, backoff));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Snap API error: ${response.status} ${await response.text()}`);
    }

    return response.json();
  }

  throw new Error('Snap API: max retries exceeded');
}

/**
 * Subscriber tier definitions for Snapchat.
 * Snap subscribers are higher-intent than IG followers.
 * 10K Snap subs ≈ 30-50K IG followers.
 */
export const SNAP_SUBSCRIBER_TIERS = {
  nano:  { min: 500,    max: 5000 },
  micro: { min: 5000,   max: 50000 },
  mid:   { min: 50000,  max: 250000 },
  macro: { min: 250000, max: Infinity },
};

/**
 * Discover creators via the Creator Discovery API.
 *
 * @param {Object} options
 * @param {string[]} [options.countryCodes=['IN']] - ISO country codes (creator_l_90_country_codes)
 * @param {string} [options.query] - Search username + display name
 * @param {number} [options.minFollowers] - Minimum subscriber count
 * @param {number} [options.maxFollowers] - Maximum subscriber count
 * @param {number} [options.minSpotlightViews] - Min Spotlight views
 * @param {number} [options.maxSpotlightViews] - Max Spotlight views
 * @param {string[]} [options.creatorCategories] - CREATOR, VLOGGER_BLOGGER, ARTIST, MUSICIAN_BAND, BUSINESS
 * @param {boolean} [options.canShareData] - Filter for data-sharing consent
 * @param {number} [options.limit=50] - Results per page
 * @param {string} [options.cursor] - Pagination cursor
 * @returns {Promise<{ creators: Array, nextCursor: string|null }>}
 */
export async function discoverCreators({
  countryCodes = ['IN'],
  query,
  minFollowers,
  maxFollowers,
  minSpotlightViews,
  maxSpotlightViews,
  creatorCategories,
  canShareData,
  limit = 50,
  cursor,
} = {}) {
  if (!isSnapApiConfigured()) {
    throw new Error('Snap API not configured — set SNAP_CLIENT_ID and SNAP_CLIENT_SECRET');
  }

  const data = await snapApiRequest('/public-profiles/creators', {
    creator_l_90_country_codes: countryCodes.join(','),
    query,
    min_followers: minFollowers,
    max_followers: maxFollowers,
    min_spotlight_views: minSpotlightViews,
    max_spotlight_views: maxSpotlightViews,
    creator_categories: creatorCategories?.join(','),
    can_share_data: canShareData,
    limit,
    cursor,
  });

  return {
    creators: (data.creators || []).map(normalizeCreator),
    nextCursor: data.paging?.next_cursor || null,
  };
}

/**
 * Get a single creator's full profile.
 */
export async function getCreatorProfile(username) {
  if (!isSnapApiConfigured()) {
    throw new Error('Snap API not configured');
  }

  const data = await snapApiRequest(`/public-profiles/${username}`);
  return normalizeCreator(data);
}

/**
 * Normalize raw API response into our standard candidate shape.
 */
function normalizeCreator(raw) {
  return {
    username: raw.username || raw.display_name,
    displayName: raw.display_name || '',
    subscriberCount: raw.subscriber_count || 0,
    isVerified: raw.is_verified || false,
    country: raw.country || '',
    bio: raw.bio || '',
    creatorCategory: raw.creator_category || '',
    profileUrl: `https://snapchat.com/add/${raw.username || raw.display_name}`,
    spotlightMetrics: raw.spotlight_metrics
      ? {
          totalViews: raw.spotlight_metrics.total_views || 0,
          avgViewsPerVideo: raw.spotlight_metrics.avg_views_per_video || 0,
          videoCount: raw.spotlight_metrics.video_count || 0,
          shareCount: raw.spotlight_metrics.share_count || 0,
        }
      : null,
    source: 'snap_api',
    profileExists: true,
    discoveredAt: new Date().toISOString(),
  };
}
