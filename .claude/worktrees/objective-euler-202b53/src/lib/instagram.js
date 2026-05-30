/**
 * Instagram Discovery Pipeline — powered by Apify
 *
 * Flow:
 *   1. Map product category → hashtags (like YouTube queries)
 *   2. Apify Hashtag Scraper → recent posts/reels under those hashtags
 *   3. Extract unique creator usernames, deduplicate
 *   4. Apify Profile Scraper → follower counts, bios
 *   5. Filter by follower range (nano/micro/mid/macro)
 *   6. Apify Comment Scraper → comments from their top posts
 *   7. Return enriched influencer objects (same shape as YouTube pipeline)
 */

const APIFY_BASE = 'https://api.apify.com/v2';

// ── Category → Hashtag mapping ──
// VERIFIED via 4-batch live Apify audit (April 2026): 906 posts, 676 creators, 70 profiles.
// Global HIGH-VOLUME tags first, India-crossover at end.
//
// EXCLUDED (audit-confirmed foreign/dead):
//   Indonesian: perawatanpria, skincarepria, serumpria, komedo, priamasakini, elvicto
//   Western brands: wahl, andis, balmain
//   Dead: branch, mengroomingproducts (misspelling)
//   Western-only: malewaxing, skinfade
const CATEGORY_HASHTAGS = {
  'Beard Oil & Beard Care': [
    // Audit verified: #beard(52) #beardlife(49) #beardcare(47) #beardoil(41) #beardgang(38)
    'beard', 'beardcare', 'beardoil', 'beardgang', 'beardlife', 'beardstyle',
    'beardgrooming', 'beardgrowth', 'beardedmen', 'beardlove', 'beardgoals',
    'beardproducts', 'beardbalm', 'beardporn', 'beardedman', 'beards',
    'stachewax', 'mustache', 'moustache',  // Key for Muuchstac brand
    'mensgrooming', 'malegrooming',
    // India-crossover: #dadhi(27) #indianbeard(25) verified
    'dadhi', 'indianbeard', 'desiswag', 'desigrooming',
  ],
  'Face Wash & Face Care': [
    // Audit verified: #glowingskin(27) #skincareformen(25) #mensfacewash(16) #mensskincare(15)
    'mensskincare', 'skincareformen', 'malegrooming', 'mensfacewash',
    'glowingskin', 'acnecare', 'skincareroutine', 'mensgrooming',
    'healthyskin', 'facecare', 'skincaretips', 'mensgroomingproducts',
    'groomingessentials', 'clearskin', 'mensselfcare', 'blackmask',
    'menskincare', 'mencare', 'skincare', 'beauty',
    // India-crossover: #indianskincare(18) verified
    'indianskincare', 'desiglowup',
  ],
  'Hair Styling & Hair Care': [
    // Core hair + barbershop tags (verified from barber batch: 237 posts)
    'menshair', 'hairstyle', 'haircut', 'menshaircut', 'fade',
    'pomade', 'hairwax', 'hairstyleformen', 'barber', 'barbershop',
    'barberlife', 'barbershopconnect', 'barberlove', 'barbering',
    'haircuts', 'hair', 'haircare', 'hairfall', 'dandruff', 'menshaircare',
    'menhairstyle', 'menhair', 'salon', 'mensalon', 'menssalon',
    'indianhairstyle', 'menshairindia',
  ],
  "Men's Grooming (General)": [
    // Audit verified: #mensgrooming(42) #malegrooming(34) #grooming(28) #mensgroomingproducts(21)
    'mensgrooming', 'malegrooming', 'grooming', 'groomingformen',
    'mensgroomingproducts', 'mensgroomingtips', 'groomingessentials',
    'mengrooming', 'mensstyle', 'menstyle', 'mensfashion', 'menfashion',
    'mensbeauty', 'luxurygrooming', 'groomingday', 'menslook',
    'shaving', 'shave', 'wetshaving', 'shaveoftheday', 'traditionalshaving',
    'shavelikeaman', 'sotd',
    // India-crossover: #indianmen(24) #indiangrooming(14) verified
    'indiangrooming', 'indianmen', 'desigrooming',
  ],
  'Skincare & Serums': [
    // Men-specific skincare + serum tags
    'mensskincare', 'skincareroutine', 'skincareformen', 'serum',
    'vitaminc', 'niacinamide', 'skincaretips', 'glowingskin',
    'healthyskin', 'skincareproducts', 'skincarecommunity',
    'menskincare', 'mencare', 'clearskin',
    'indianskincare', 'indianbeauty',
  ],
  'Deodorants & Perfumes': [
    // Fragrance + deo tags, attar/oud culturally resonant in India
    'perfume', 'fragrance', 'cologne', 'mensfragrance', 'deodorant',
    'scentoftheday', 'fragrancereview', 'fragrancecollection',
    'attar', 'oud', 'perfumelover',
    'perfumeindia', 'indianperfume',
  ],
  'Home Care & Air Fresheners': [
    'homefragrance', 'airfreshener', 'roomfreshener', 'homedecor', 'homecare',
    'aromatherapy', 'essentialoils', 'homesweethome', 'candles',
    'homefragranceindia', 'indianhome',
  ],
};

// ── Follower range filters (mirrors YouTube subscriber ranges) ──
const FOLLOWER_RANGES = {
  nano:  { min: 1000,   max: 10000 },
  micro: { min: 10000,  max: 100000 },
  mid:   { min: 100000, max: 500000 },
  macro: { min: 500000, max: Infinity },
};

// ── India geo-signals for filtering non-Indian accounts ──
const INDIA_CITIES = new Set([
  'mumbai', 'delhi', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'kolkata',
  'pune', 'jaipur', 'lucknow', 'ahmedabad', 'surat', 'indore', 'bhopal',
  'chandigarh', 'noida', 'gurgaon', 'gurugram', 'kochi', 'coimbatore',
  'nagpur', 'patna', 'ranchi', 'dehradun', 'goa', 'thiruvananthapuram',
  'mysore', 'mysuru', 'vadodara', 'varanasi', 'agra', 'nashik', 'ludhiana',
  'amritsar', 'visakhapatnam', 'vizag', 'bhubaneswar', 'guwahati', 'raipur',
  'jodhpur', 'udaipur', 'mangalore', 'thane', 'faridabad', 'kanpur', 'meerut',
  'rajkot', 'jammu', 'srinagar', 'trivandrum', 'thrissur', 'madurai',
  'vijayawada', 'guntur', 'hubli', 'belgaum', 'aurangabad', 'nanded',
  'jalandhar', 'bathinda', 'shimla', 'gangtok', 'shillong', 'imphal',
]);

const INDIA_REGIONS = new Set([
  'india', 'bharat', 'maharashtra', 'karnataka', 'tamil nadu', 'telangana',
  'kerala', 'andhra pradesh', 'gujarat', 'rajasthan', 'uttar pradesh',
  'madhya pradesh', 'west bengal', 'punjab', 'haryana', 'bihar',
  'odisha', 'jharkhand', 'uttarakhand', 'assam', 'chhattisgarh',
  'himachal pradesh',
]);

const INDIA_KEYWORDS = new Set([
  'bhai', 'yaar', 'dost', 'desi', 'swadeshi', 'ayurveda', 'ayurvedic',
  'gharelu', 'nuskha', 'upay', 'tarika', 'kaise', 'kare', 'hindi',
  'hindustani', 'bharatiya', 'indianblogger', 'indiancreator',
]);

/**
 * Check if a profile is CLEARLY non-Indian.
 * Inverted logic: we only REJECT when foreign signals are obvious.
 * Most Indian creators don't write "India" in their bio — so requiring
 * positive India signals would reject legitimate Indian influencers.
 * Instead, we catch the obvious foreigners (Nigerian brands, US creators, etc).
 */
function isLikelyNonIndian(profile, postData) {
  const bio = (profile.biography || '').toLowerCase();
  const postLoc = (postData.locationName || '').toLowerCase();
  const latestPosts = profile.latestPosts || [];

  // Collect location + bio text
  const locationTexts = [bio, postLoc];
  for (const lp of latestPosts.slice(0, 5)) {
    if (lp.locationName) locationTexts.push(lp.locationName.toLowerCase());
  }
  const combined = locationTexts.join(' ');

  // Clear non-Indian country mentions in bio/location
  const foreignCountries = /\b(nigeria|usa|united states|uk|united kingdom|canada|australia|pakistan|bangladesh|dubai|uae|saudi|brazil|germany|france|italy|spain|south africa|kenya|ghana|indonesia|malaysia|japan|korea|china|philippines|turkey|egypt|mexico|colombia|argentina|thailand|vietnam|qatar|bahrain|oman|kuwait|new zealand|ireland|scotland|sweden|norway|denmark|netherlands|poland|russia|ukraine)\b/i;

  if (foreignCountries.test(combined)) return true;

  // Clear non-Indian cities in bio/location
  const foreignCities = /\b(lagos|new york|london|los angeles|toronto|sydney|melbourne|karachi|lahore|dhaka|dubai|riyadh|nairobi|accra|jakarta|kuala lumpur|beijing|shanghai|tokyo|seoul|manila|cairo|berlin|paris|rome|madrid|cape town|sao paulo|bangkok|ho chi minh|amsterdam|stockholm|moscow|warsaw|doha|abu dhabi|singapore city|san francisco|chicago|houston|dallas|miami|seattle|boston|atlanta)\b/i;

  if (foreignCities.test(combined)) return true;

  return false;
}

/**
 * Detect brand/company pages that are NOT individual influencers.
 * Brand pages: very low following, brand keywords in bio, company-like behavior.
 */
function isLikelyBrandPage(profile) {
  const bio = (profile.biography || '').toLowerCase();
  const following = profile.followsCount || 0;
  const followers = profile.followersCount || 0;

  const brandKeywords = /\b(official|brand|company|shop now|order now|worldwide|™|®|shipping|enquir|wholesale|manufacturer|store|outlet|est\.|since \d{4}|founded)\b/i;
  const hasBrandBio = brandKeywords.test(bio);

  // Following < 50 with significant followers = almost certainly a brand
  if (following < 50 && followers > 2000 && hasBrandBio) return true;
  // Following <= 10 with any brand keywords = brand page
  if (following <= 10 && hasBrandBio) return true;
  return false;
}

/**
 * Run an Apify actor and return the dataset items.
 */
async function runApifyActor(actorId, input, apiToken, timeoutSecs = 120) {
  // Start the run and wait for completion
  const runRes = await fetch(
    `${APIFY_BASE}/acts/${actorId}/runs?waitForFinish=${timeoutSecs}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify(input),
    }
  );

  if (!runRes.ok) {
    const err = await runRes.json().catch(() => ({}));
    throw new Error(`Apify actor ${actorId} failed: ${err.error?.message || runRes.statusText}`);
  }

  const runData = await runRes.json();
  const run = runData.data;

  if (run.status !== 'SUCCEEDED') {
    throw new Error(`Apify actor ${actorId} status: ${run.status} — ${run.statusMessage || ''}`);
  }

  // Fetch dataset items
  const datasetRes = await fetch(
    `${APIFY_BASE}/datasets/${run.defaultDatasetId}/items?limit=200`,
    {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    }
  );

  if (!datasetRes.ok) {
    throw new Error(`Failed to fetch Apify dataset: ${datasetRes.statusText}`);
  }

  return datasetRes.json();
}

/**
 * S4: Compute comment quality metrics from raw comment texts.
 * Returns a structured object that Claude can use for deeper analysis.
 */
function computeCommentQuality(comments, creatorUsername) {
  if (!comments || comments.length === 0) {
    return {
      totalComments: 0,
      avgLength: 0,
      emojiOnlyPercent: 0,
      substantivePercent: 0,
      questionPercent: 0,
      uniqueSignals: 0,
      qualityTier: 'no_data',
    };
  }

  const emojiRegex = /^[\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Emoji_Component}\s❤️🔥💯👏🙏😍😂💪👌✨💕🥰😊🤩🎉👍💜💙💚🧡💛🤍🖤]+$/u;
  const genericPhrases = /^(nice|great|good|awesome|best|wow|love it|amazing|super|cool|ok|okay|beautiful|lovely|perfect|fab|fire|lit|slay|queen|king|❤️|🔥|💯|👏|👍|😍)[\s!.]*$/i;

  let totalLen = 0;
  let emojiOnly = 0;
  let generic = 0;
  let substantive = 0; // >20 chars and not generic
  let questions = 0;
  let personalStories = 0; // "I tried", "I bought", "I use", "mere", "mujhe", "maine"
  let purchaseIntent = 0; // "where to buy", "link", "price", "kaha milega", "order"

  const personalRegex = /\b(i tried|i bought|i use|i ordered|maine|mujhe|mere|njan|nenu|naanu|aami)\b/i;
  const purchaseRegex = /\b(where to buy|price|link|kaha milega|kahan se|order kaise|cost|kharido|buy|shop)\b/i;

  for (const text of comments) {
    const trimmed = text.trim();
    totalLen += trimmed.length;

    if (emojiRegex.test(trimmed) || trimmed.length <= 2) {
      emojiOnly++;
    } else if (genericPhrases.test(trimmed)) {
      generic++;
    } else if (trimmed.length > 20) {
      substantive++;
    }

    if (trimmed.includes('?') || /\b(kaise|how|kya|what|which|konsa|enna|ela|hegge)\b/i.test(trimmed)) {
      questions++;
    }

    if (personalRegex.test(trimmed)) personalStories++;
    if (purchaseRegex.test(trimmed)) purchaseIntent++;
  }

  const total = comments.length;
  const avgLength = Math.round(totalLen / total);
  const emojiOnlyPct = Math.round((emojiOnly / total) * 100);
  const genericPct = Math.round((generic / total) * 100);
  const substantivePct = Math.round((substantive / total) * 100);
  const questionPct = Math.round((questions / total) * 100);

  // Quality tier: based on ratio of substantive vs junk
  let qualityTier = 'low';
  if (substantivePct >= 40 && emojiOnlyPct < 30) qualityTier = 'high';
  else if (substantivePct >= 20 && emojiOnlyPct < 50) qualityTier = 'medium';
  else if (emojiOnlyPct >= 70) qualityTier = 'very_low';

  return {
    totalComments: total,
    avgLength,
    emojiOnlyPercent: emojiOnlyPct,
    genericPercent: genericPct,
    substantivePercent: substantivePct,
    questionPercent: questionPct,
    personalStoryCount: personalStories,
    purchaseIntentCount: purchaseIntent,
    qualityTier,
  };
}

/**
 * Main Instagram search pipeline.
 *
 * Returns { results, platformBreakdown } in the same shape as the YouTube pipeline,
 * so the frontend can display Instagram results alongside YouTube results.
 */
export async function searchInstagram({
  category,
  subscriberRange = 'micro',
  maxResults = 5,
  userLearnings = [],
  gateConfig = null,
  apiToken,
}) {
  if (!apiToken) throw new Error('Apify API token not configured');

  // Gate config — user overrides merged on defaults. Only applyUserLearnings
  // is wired through for IG right now; other gate flags are YouTube-specific.
  const gates = {
    applyUserLearnings: true,
    ...(gateConfig || {}),
  };

  // User-driven learning blocklist (channelId = IG username, keywords = extra text match)
  const blockedUsernames = new Set();
  const blockedKeywords = [];
  if (gates.applyUserLearnings && Array.isArray(userLearnings)) {
    for (const l of userLearnings) {
      if (l?.channelId) blockedUsernames.add(String(l.channelId).toLowerCase());
      if (Array.isArray(l?.keywords)) {
        for (const k of l.keywords) {
          if (typeof k === 'string' && k.length >= 3) blockedKeywords.push(k.toLowerCase());
        }
      }
    }
  }
  const isBlockedByLearning = (username, bio) => {
    if (!username) return false;
    if (blockedUsernames.has(String(username).toLowerCase())) return true;
    if (blockedKeywords.length === 0) return false;
    const hay = `${username} ${bio || ''}`.toLowerCase();
    return blockedKeywords.some((k) => hay.includes(k));
  };

  // ── Phase 1: Map category to hashtags ──
  let hashtags = CATEGORY_HASHTAGS[category];
  if (!hashtags) {
    // Custom category: generate realistic Instagram hashtags from free text
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'of', 'in', 'on', 'to', 'is', 'it', 'by', 'with']);
    const words = category.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 1 && !stopWords.has(w));
    const generated = new Set();

    // Full phrase joined: "lip balm men" → "lipbalmmen"
    if (words.length >= 2) generated.add(words.join(''));
    // Adjacent pairs: "lip balm", "balm men" → "lipbalm", "balmmen"
    for (let i = 0; i < words.length - 1; i++) {
      generated.add(words[i] + words[i + 1]);
    }
    // Each meaningful word (4+ chars): "balm", "review"
    for (const w of words) {
      if (w.length >= 4) generated.add(w);
    }
    // Common Instagram suffixes
    if (words.length >= 2) {
      generated.add(words.slice(0, 2).join('') + 'review');
      generated.add(words.slice(0, 2).join('') + 'india');
    }
    // Always add broad fallbacks for discoverability (high-volume global tags)
    generated.add('mensgrooming');
    generated.add('malegrooming');
    generated.add('productreview');
    // India-crossover tags for supplementary discovery
    generated.add('indiangrooming');
    generated.add('desigrooming');

    hashtags = [...generated].slice(0, 8);
    console.log(`[Instagram] Custom category "${category}" → generated hashtags: ${hashtags.join(', ')}`);
  }
  // Global HIGH-VOLUME hashtags first (where Indian creators actually post),
  // then India-crossover tags as supplementary discovery signal.
  // Research: Indian creators use #beard, #mensskincare, #mensgrooming — NOT #skincareindia.
  const indiaRegex = /india|indian|desi|bharat|dadhi/i;
  const globalTags = hashtags.filter(h => !indiaRegex.test(h));
  const indiaTags = hashtags.filter(h => indiaRegex.test(h));
  const selectedHashtags = [...globalTags.slice(0, 5), ...indiaTags.slice(0, 2)].slice(0, 7);

  console.log(`[Instagram] Searching hashtags: ${selectedHashtags.join(', ')}`);

  // ── Phase 2: Hashtag search → recent posts ──
  const hashtagResults = await runApifyActor(
    'apify~instagram-hashtag-scraper',
    {
      hashtags: selectedHashtags,
      resultsLimit: 150, // Larger pool — niche India hashtags may have fewer posts
    },
    apiToken,
    180
  );

  if (!hashtagResults || hashtagResults.length === 0) {
    return {
      results: [],
      platformBreakdown: {},
      _meta: {
        hashtagsSearched: selectedHashtags,
        totalPostsFound: 0,
        failReason: 'No posts found under searched hashtags',
      },
    };
  }

  console.log(`[Instagram] Found ${hashtagResults.length} posts across hashtags`);

  // ── Phase 3: Extract unique creators ──
  const creatorMap = new Map(); // username → best post data
  for (const post of hashtagResults) {
    const username = post.ownerUsername;
    if (!username) continue;

    // Keep the post with the most engagement per creator
    const existing = creatorMap.get(username);
    const engagement = (post.likesCount || 0) + (post.commentsCount || 0);
    if (!existing || engagement > existing._engagement) {
      creatorMap.set(username, {
        ...post,
        _engagement: engagement,
      });
    }
  }

  // Sort by engagement BEFORE profile scraping — high-engagement posts are
  // more likely from established creators (10K+ followers), not tiny accounts.
  const uniqueCreators = [...creatorMap.entries()]
    .sort((a, b) => b[1]._engagement - a[1]._engagement)
    .map(([username]) => username);
  console.log(`[Instagram] ${uniqueCreators.length} unique creators found (sorted by engagement)`);

  if (uniqueCreators.length === 0) {
    return {
      results: [],
      platformBreakdown: {},
      _meta: {
        hashtagsSearched: selectedHashtags,
        totalPostsFound: hashtagResults.length,
        uniqueCreators: 0,
        failReason: 'No creator usernames found in hashtag results',
      },
    };
  }

  // ── Phase 4: Scrape profiles for follower counts ──
  // Scrape enough profiles to find creators in the target follower range.
  // Higher minimum (50) ensures we don't miss good creators at the tail.
  const profileLimit = Math.min(Math.max(maxResults * 6, 50), 80);
  const profilesToScrape = uniqueCreators.slice(0, profileLimit);
  let profiles = [];

  try {
    profiles = await runApifyActor(
      'apify~instagram-profile-scraper',
      { usernames: profilesToScrape },
      apiToken,
      180
    );
  } catch (e) {
    console.error('[Instagram] Profile scraping failed:', e.message);
    // Fall back to hashtag data without follower filtering
  }

  // Build profile lookup
  const profileMap = new Map();
  for (const p of profiles) {
    if (p.username) profileMap.set(p.username, p);
  }

  console.log(`[Instagram] Profiles: ${profileMap.size} scraped of ${profilesToScrape.length} requested (${uniqueCreators.length} total unique)`);

  // ── Phase 5: Filter by follower range ──
  const range = FOLLOWER_RANGES[subscriberRange] || FOLLOWER_RANGES.micro;
  const filtered = [];

  for (const [username, postData] of creatorMap.entries()) {
    const profile = profileMap.get(username);
    if (!profile) continue;

    const followers = profile.followersCount || 0;
    if (followers >= range.min && followers < range.max) {
      filtered.push({ username, postData, profile });
    }
  }

  console.log(`[Instagram] ${filtered.length} creators in ${subscriberRange} range (${range.min}-${range.max})`);

  // ── Phase 5a: Remove brand pages + obvious non-Indian accounts ──
  const qualityFiltered = filtered.filter(({ username, profile, postData }) => {
    if (isLikelyBrandPage(profile)) {
      console.log(`[Instagram] Skipped @${username}: brand/company page (following: ${profile.followsCount})`);
      return false;
    }
    if (isLikelyNonIndian(profile, postData)) {
      console.log(`[Instagram] Skipped @${username}: non-Indian signals detected`);
      return false;
    }
    return true;
  });

  console.log(`[Instagram] India + quality filter: ${qualityFiltered.length} of ${filtered.length} passed`);

  // Graceful fallback: if quality filter removed everyone, use unfiltered pool
  const preGatePool = qualityFiltered.length > 0 ? qualityFiltered : filtered;
  if (qualityFiltered.length === 0 && filtered.length > 0) {
    console.log(`[Instagram] ⚠️ Quality filter removed all — falling back to ${filtered.length} unfiltered creators`);
  }

  // ── Phase 5b: HARD FRAUD GATE — reject obvious fakes before wasting Claude credits ──
  const fraudFiltered = [];
  const fraudRejected = [];

  for (const creator of preGatePool) {
    const { profile, postData } = creator;
    const followers = profile.followersCount || 0;
    const following = profile.followsCount || 0;
    const posts = profile.postsCount || 0;
    const latestPosts = profile.latestPosts || [];

    // Compute quick engagement rate for gate check
    let quickEngRate = 0;
    if (followers > 0 && latestPosts.length > 0) {
      const rates = latestPosts.slice(0, 6).map(
        (lp) => ((lp.likesCount || 0) + (lp.commentsCount || 0)) / followers * 100
      );
      quickEngRate = rates.reduce((s, r) => s + r, 0) / rates.length;
    } else if (followers > 0) {
      quickEngRate = ((postData.likesCount || 0) + (postData.commentsCount || 0)) / followers * 100;
    }

    const followRatio = following > 0 ? followers / following : 999;
    const reasons = [];

    // Gate 1: Follow/following ratio — mass follow-back behavior
    if (followRatio < 1.5 && followers > 2000) {
      reasons.push(`follow ratio ${followRatio.toFixed(1)}:1 (likely follow-for-follow)`);
    }

    // Gate 2: Absurdly high following count (>7500 = follow-bots)
    if (following > 7500) {
      reasons.push(`following ${following.toLocaleString()} accounts (mass-follow behavior)`);
    }

    // Gate 3: Engagement too low — dead or bought audience
    if (quickEngRate < 0.3 && followers > 5000) {
      reasons.push(`engagement ${quickEngRate.toFixed(2)}% (dead/bought audience)`);
    }

    // Gate 4: Engagement impossibly high — engagement pods or fake
    if (quickEngRate > 25) {
      reasons.push(`engagement ${quickEngRate.toFixed(1)}% (suspicious — engagement pods)`);
    }

    // Gate 5: Too few posts for a credible creator
    if (posts < 10) {
      reasons.push(`only ${posts} posts (too new/inactive)`);
    }

    if (reasons.length >= 2) {
      // Multiple fraud signals → reject
      fraudRejected.push({ username: creator.username, reasons });
      console.log(`[Instagram] ❌ Rejected @${creator.username}: ${reasons.join('; ')}`);
    } else {
      fraudFiltered.push(creator);
    }
  }

  console.log(`[Instagram] Fraud gate: ${fraudFiltered.length} passed, ${fraudRejected.length} rejected`);

  // Graceful fallback: if fraud gate removed everyone, use pre-gate pool
  let finalPool = fraudFiltered;
  if (fraudFiltered.length === 0 && preGatePool.length > 0) {
    console.log(`[Instagram] ⚠️ Fraud gate removed all — falling back to ${preGatePool.length} pre-gate creators`);
    finalPool = preGatePool;
  }

  // Drop any creators on the user's "not relevant" learning blocklist
  if (blockedUsernames.size > 0 || blockedKeywords.length > 0) {
    for (let i = finalPool.length - 1; i >= 0; i--) {
      const { postData, profile } = finalPool[i];
      if (isBlockedByLearning(postData?.username, profile?.biography)) {
        finalPool.splice(i, 1);
      }
    }
  }

  // Sort by engagement and take top N (S5: scale with user's requested count)
  finalPool.sort((a, b) => b.postData._engagement - a.postData._engagement);
  const topCreators = finalPool.slice(0, maxResults);

  if (topCreators.length === 0) {
    return {
      results: [],
      platformBreakdown: { [subscriberRange]: 0 },
      _meta: {
        hashtagsSearched: selectedHashtags,
        totalPostsFound: hashtagResults.length,
        uniqueCreators: uniqueCreators.length,
        profilesScraped: profileMap.size,
        inRangeCount: filtered.length,
        qualityFilterPassed: qualityFiltered.length,
        fraudGatePassed: fraudFiltered.length,
        fraudDetails: fraudRejected.slice(0, 5),
        failReason: 'No creators remained after all filters — try a broader follower range',
      },
    };
  }

  // ── Phase 6: Scrape comments from their top posts ──
  // Collect post URLs to scrape comments from
  const postUrls = [];
  for (const creator of topCreators) {
    // Use the hashtag search post URL
    if (creator.postData.url) {
      postUrls.push(creator.postData.url);
    }
    // Also add their latest posts from profile data (if available)
    const latestPosts = creator.profile.latestPosts || [];
    for (const lp of latestPosts.slice(0, 2)) {
      if (lp.url && !postUrls.includes(lp.url)) {
        postUrls.push(lp.url);
      }
    }
  }

  // S5: Scale comment scraping with requested results (min 15, max 40 URLs)
  const commentUrlLimit = Math.min(Math.max(topCreators.length * 2, 15), 40);
  let allComments = [];
  if (postUrls.length > 0) {
    try {
      allComments = await runApifyActor(
        'apify~instagram-comment-scraper',
        {
          directUrls: postUrls.slice(0, commentUrlLimit),
          resultsLimit: 100,
        },
        apiToken,
        180
      );
    } catch (e) {
      console.error('[Instagram] Comment scraping failed:', e.message);
    }
  }

  // ── Phase 6b: Map comments back to post URLs for accurate attribution ──
  // Build a lookup: postUrl → array of comment objects (with text + metadata)
  const commentsByUrl = new Map();
  for (const comment of allComments) {
    // Apify comment scraper returns inputUrl or postUrl linking to the source post
    const url = comment.inputUrl || comment.postUrl || comment.url || '';
    if (!commentsByUrl.has(url)) commentsByUrl.set(url, []);
    commentsByUrl.get(url).push(comment);
  }

  // Also build a set of post URLs per creator for correct attribution
  const creatorPostUrls = new Map(); // username → Set of post URLs
  for (const creator of topCreators) {
    const urls = new Set();
    if (creator.postData.url) urls.add(creator.postData.url);
    const latestPosts = creator.profile.latestPosts || [];
    for (const lp of latestPosts.slice(0, 2)) {
      if (lp.url) urls.add(lp.url);
    }
    creatorPostUrls.set(creator.username, urls);
  }

  // ── Phase 7: Build result objects (same shape as YouTube pipeline) ──
  const results = topCreators.map((creator, idx) => {
    const { username, postData, profile } = creator;

    // ── FIXED: Attribute comments ONLY to the correct creator ──
    const creatorComments = [];
    const creatorCommentLikes = []; // Track top-liked comments separately
    const myPostUrls = creatorPostUrls.get(username) || new Set();

    // Get comments from posts that belong to THIS creator
    for (const [url, comments] of commentsByUrl.entries()) {
      if (myPostUrls.has(url)) {
        for (const c of comments) {
          if (c.text) {
            creatorComments.push(c.text);
            if ((c.likesCount || 0) >= 3) {
              creatorCommentLikes.push({ text: c.text, likes: c.likesCount });
            }
          }
        }
      }
    }

    // Also add latestComments from hashtag scrape (these are per-post already)
    if (postData.latestComments) {
      for (const lc of postData.latestComments) {
        if (lc.text && !creatorComments.includes(lc.text)) {
          creatorComments.push(lc.text);
        }
      }
    }

    // Build caption + recent captions as context
    const captions = [postData.caption || ''];
    const latestPosts = profile.latestPosts || [];
    if (latestPosts.length > 0) {
      for (const lp of latestPosts.slice(0, 5)) {
        if (lp.caption) captions.push(lp.caption);
      }
    }

    // ═══ S2: ROBUST ACCOUNT-LEVEL ENGAGEMENT RATE ═══
    // Compute per-post rates, then aggregate with consistency measure
    const engagementBreakdown = { avg: 'N/A', likeRate: 'N/A', commentRate: 'N/A', consistency: 'N/A', perPost: [] };
    if (profile.followersCount > 0 && latestPosts.length > 0) {
      const postsToAnalyze = latestPosts.slice(0, 12);
      const perPostRates = postsToAnalyze.map((lp) => {
        const likes = lp.likesCount || 0;
        const cmts = lp.commentsCount || 0;
        const total = (likes + cmts) / profile.followersCount * 100;
        return { total, likeRate: likes / profile.followersCount * 100, commentRate: cmts / profile.followersCount * 100 };
      });

      const avgEng = perPostRates.reduce((s, r) => s + r.total, 0) / perPostRates.length;
      const avgLike = perPostRates.reduce((s, r) => s + r.likeRate, 0) / perPostRates.length;
      const avgComment = perPostRates.reduce((s, r) => s + r.commentRate, 0) / perPostRates.length;

      // Standard deviation for consistency — low StdDev = consistent performer
      const variance = perPostRates.reduce((s, r) => s + Math.pow(r.total - avgEng, 2), 0) / perPostRates.length;
      const stdDev = Math.sqrt(variance);
      const coeffOfVariation = avgEng > 0 ? (stdDev / avgEng) : 0; // CV: 0-0.5 = consistent, >1 = erratic

      engagementBreakdown.avg = avgEng.toFixed(2) + '%';
      engagementBreakdown.likeRate = avgLike.toFixed(2) + '%';
      engagementBreakdown.commentRate = avgComment.toFixed(3) + '%';
      engagementBreakdown.consistency = coeffOfVariation < 0.3 ? 'very_consistent' : coeffOfVariation < 0.6 ? 'consistent' : coeffOfVariation < 1.0 ? 'variable' : 'erratic';
      engagementBreakdown.stdDev = stdDev.toFixed(2) + '%';
      engagementBreakdown.postsAnalyzed = postsToAnalyze.length;
      engagementBreakdown.perPost = perPostRates.slice(0, 5).map((r) => r.total.toFixed(2) + '%');
    } else if (profile.followersCount > 0) {
      // Fallback to single discovered post
      const singleEng = ((postData.likesCount || 0) + (postData.commentsCount || 0)) / profile.followersCount * 100;
      engagementBreakdown.avg = singleEng.toFixed(2) + '%';
      engagementBreakdown.consistency = 'unknown (single post)';
      engagementBreakdown.postsAnalyzed = 1;
    }

    // ═══ S4: COMMENT QUALITY METRICS ═══
    const commentQuality = computeCommentQuality(creatorComments, username);

    // ── Collect Instagram-specific signals for richer Claude analysis ──
    const followRatio = profile.followersCount > 0 && profile.followsCount > 0
      ? (profile.followersCount / profile.followsCount).toFixed(1)
      : null;

    // Check for sponsored/branded content signals
    const sponsoredPosts = latestPosts.filter((lp) =>
      lp.isSponsored || (lp.caption && /\b(ad|paid|sponsored|collab|partnership|gifted)\b/i.test(lp.caption))
    ).length;

    // Extract tagged brands from recent posts
    const taggedUsers = new Set();
    for (const lp of latestPosts.slice(0, 10)) {
      if (lp.taggedUsers) {
        for (const t of lp.taggedUsers) {
          if (t.username) taggedUsers.add(t.username);
        }
      }
    }

    // Extract post locations for geography context
    const locations = [];
    if (postData.locationName) locations.push(postData.locationName);
    for (const lp of latestPosts.slice(0, 10)) {
      if (lp.locationName && !locations.includes(lp.locationName)) {
        locations.push(lp.locationName);
      }
    }

    // Post recency — days since the hashtag-discovered post
    const postAge = postData.timestamp
      ? Math.round((Date.now() - new Date(postData.timestamp).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      // Same shape as YouTube results — frontend-compatible
      channelId: `ig_${profile.id || username}`,
      channelName: profile.fullName || username,
      channelThumbnail: profile.profilePicUrl || null,
      channelDescription: profile.biography || '',
      subscriberCount: profile.followersCount || 0,
      videoTitle: postData.caption?.slice(0, 100) || 'Instagram Reel',
      videoViewCount: postData.videoPlayCount || postData.likesCount || 0,
      videoLikeCount: postData.likesCount || 0,
      comments: creatorComments.slice(0, 150),
      searchLanguage: null,
      platform: 'instagram',
      _instagramData: {
        username,
        postsCount: profile.postsCount || 0,
        followingCount: profile.followsCount || 0,
        postUrl: postData.url,
        postType: postData.productType || postData.type,
        commentsCount: postData.commentsCount || 0,
        hashtags: postData.hashtags || [],
        isVerified: profile.isVerified || false,
        isBusinessAccount: profile.isBusinessAccount || false,
        businessCategory: profile.businessCategoryName || null,
        // S2: Robust engagement breakdown
        engagementRate: engagementBreakdown.avg,
        engagementBreakdown,
        // S4: Comment quality metrics
        commentQuality,
        followRatio,
        sponsoredPostCount: sponsoredPosts,
        taggedBrands: [...taggedUsers].slice(0, 10),
        locations: locations.slice(0, 5),
        postAgeDays: postAge,
        topLikedComments: creatorCommentLikes.sort((a, b) => b.likes - a.likes).slice(0, 5),
        recentCaptions: captions.slice(0, 5),
        externalUrl: profile.externalUrl || null,
      },
    };
  });

  return {
    results,
    platformBreakdown: { instagram: results.length },
    _meta: {
      hashtagsSearched: selectedHashtags,
      totalPostsFound: hashtagResults.length,
      uniqueCreators: uniqueCreators.length,
      inRangeCount: filtered.length,
      indiaFilterPassed: qualityFiltered.length,
      indiaFilterRejected: filtered.length - qualityFiltered.length,
      fraudRejected: fraudRejected.length,
      fraudDetails: fraudRejected.slice(0, 5),
    },
  };
}
