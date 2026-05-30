/**
 * robustnessGates.js
 *
 * Four-gate YouTube channel robustness system for Muuchstac Scout.
 * Filters out channels that are irrelevant, gender-mismatched, engagement-dead,
 * or topically off-target for men's grooming influencer discovery.
 *
 * Sources cited:
 *  - Miqwal 2026 (view-to-sub ratio benchmarks)
 *  - Marketing Charts / Markerly (influencer engagement scaling)
 *  - Upfluence / Spiralytics 2024 (micro-influencer engagement rate benchmarks)
 *  - Gleemo AI (absolute reach floor for mid-tier channels)
 */

// ---------------------------------------------------------------------------
// Gate 1 -- Category Blocker
// ---------------------------------------------------------------------------

/** Topic strings returned in `channel.topicDetails.topicCategories` URLs. */
const BLOCKED_TOPICS = [
  'Agriculture',
  'Health',
  'News',
  'Politics',
  'Autos & Vehicles',
  'Sports',
  'Travel',
  // Tech / Electronics — blocks trimmer-review channels that are tech-focused
  'Technology',
  'Electronics',
  'Computer',
  'Consumer_electronics',
];

/**
 * YouTube `videoCategory` IDs that are off-limits.
 * 17 = Sports, 19 = Travel & Events, 25 = News & Politics, 2 = Autos & Vehicles.
 */
const BLOCKED_CATEGORY_IDS = new Set(['17', '19', '25', '2']);

/**
 * Gate 1 -- Block channels whose declared YouTube categories are outside the
 * men's grooming / lifestyle universe.
 *
 * @param {object} channel - YouTube `channels.list` resource with
 *   `snippet`, `statistics`, and `topicDetails` parts.
 * @returns {{ pass: boolean, reason?: string, gate?: number, details?: string }}
 */
function gate1CategoryBlocker(channel) {
  // --- Check topicDetails.topicCategories (Wikipedia-style URLs) ----------
  const topicCategories = channel?.topicDetails?.topicCategories ?? [];
  for (const url of topicCategories) {
    for (const blocked of BLOCKED_TOPICS) {
      if (url.toLowerCase().includes(blocked.toLowerCase())) {
        return {
          pass: false,
          reason: 'BLOCKED_CATEGORY',
          gate: 1,
          details: `Topic category matched blocked term: "${blocked}" in ${url}`,
        };
      }
    }
  }

  // --- Check snippet.categoryId (numeric string) -------------------------
  const categoryId = String(channel?.snippet?.categoryId ?? '');
  if (categoryId && BLOCKED_CATEGORY_IDS.has(categoryId)) {
    return {
      pass: false,
      reason: 'BLOCKED_CATEGORY',
      gate: 1,
      details: `Channel categoryId ${categoryId} is on the block-list`,
    };
  }

  return { pass: true };
}

// ---------------------------------------------------------------------------
// Gate 2 -- Gender-Mismatch Detector
// ---------------------------------------------------------------------------

/**
 * Women's fashion / grooming signal terms across English and regional Indian
 * languages. A channel must trip 2+ signals before it is rejected -- a single
 * stray mention is tolerated.
 */
const GENDER_SIGNALS = [
  // English
  'saree', 'dupatta', 'blouse', 'mehndi', 'bridal', 'ladies',
  'women hairstyle', 'women fashion', 'girl makeup', 'lehenga',
  'salwar', 'kurta women', 'ethnic wear women',
  // Telugu
  'మహిళ', 'అమ్మాయి', 'పెళ్ళి కూతురు', 'చీర',
  // Kannada
  'ಮಹಿಳೆ', 'ಹೆಣ್ಣು', 'ಸೀರೆ', 'ಮದುವೆ',
  // Tamil
  'பெண்', 'மணமகள்', 'புடவை',
  // Malayalam
  'സ്ത്രീ', 'പെൺ', 'സാരി',
  // Hindi
  'महिला', 'दुल्हन', 'साड़ी', 'लहंगा', 'मेहंदी',
];

/**
 * Gate 2 -- Detect women's fashion / grooming signals in channel description
 * and recent video titles. Requires 2+ distinct signal hits to reject.
 *
 * @param {string} channelDescription - The channel's `snippet.description`.
 * @param {string[]} videoTitles - Array of recent video title strings.
 * @returns {{ pass: boolean, reason?: string, gate?: number, signalsFound?: string[] }}
 */
function gate2GenderMismatch(channelDescription, videoTitles) {
  const corpus = [
    channelDescription ?? '',
    ...(videoTitles ?? []),
  ].join(' ').toLowerCase();

  const hits = [];

  for (const signal of GENDER_SIGNALS) {
    if (corpus.includes(signal.toLowerCase())) {
      hits.push(signal);
    }
  }

  if (hits.length >= 2) {
    return {
      pass: false,
      reason: 'GENDER_MISMATCH',
      gate: 2,
      signalsFound: hits,
    };
  }

  return { pass: true };
}

// ---------------------------------------------------------------------------
// Gate 3 -- Engagement Sanity Check
// ---------------------------------------------------------------------------

/**
 * Gate 3 -- Verify that the channel's engagement metrics meet minimum
 * thresholds before spending an LLM call.
 *
 * Thresholds:
 *  - View-to-Sub ratio: HARD REJECT < 5%, WARN < 10%  (source: Miqwal 2026)
 *  - Engagement rate:   HARD REJECT < 0.5%, WARN < 2%  (derived from
 *    Upfluence / Spiralytics 2024 micro-influencer benchmark of 5.19%)
 *  - Absolute reach:    HARD REJECT if subs >= 50,000 AND avgViews < 500
 *    (source: Gleemo AI dead-channel heuristic)
 *
 * @param {{ subscriberCount: number, avgViewsPerVideo: number, engagementRate: number }} stats
 * @returns {{ pass: boolean, reason?: string, gate?: number, rejections?: object[], warnings: object[] }}
 */
function gate3EngagementSanity(stats) {
  const { subscriberCount, avgViewsPerVideo, engagementRate } = stats;
  const rejections = [];
  const warnings = [];

  // --- View-to-Sub ratio -------------------------------------------------
  const viewToSubPct = subscriberCount > 0
    ? (avgViewsPerVideo / subscriberCount) * 100
    : 0;

  if (viewToSubPct < 5) {
    rejections.push({
      metric: 'viewToSubRatio',
      value: `${viewToSubPct.toFixed(2)}%`,
      threshold: '< 5% (hard reject)',
      source: 'Miqwal 2026',
    });
  } else if (viewToSubPct < 10) {
    warnings.push({
      metric: 'viewToSubRatio',
      value: `${viewToSubPct.toFixed(2)}%`,
      threshold: '< 10% (warn)',
      source: 'Miqwal 2026',
    });
  }

  // --- Engagement rate ---------------------------------------------------
  if (engagementRate < 0.5) {
    rejections.push({
      metric: 'engagementRate',
      value: `${engagementRate.toFixed(2)}%`,
      threshold: '< 0.5% (hard reject)',
      source: 'Upfluence / Spiralytics 2024',
    });
  } else if (engagementRate < 2) {
    warnings.push({
      metric: 'engagementRate',
      value: `${engagementRate.toFixed(2)}%`,
      threshold: '< 2% (warn)',
      source: 'Upfluence / Spiralytics 2024',
    });
  }

  // --- Absolute reach floor (mid-tier dead channel check) ----------------
  if (subscriberCount >= 50_000 && avgViewsPerVideo < 500) {
    rejections.push({
      metric: 'absoluteReach',
      value: `subs=${subscriberCount}, avgViews=${avgViewsPerVideo}`,
      threshold: 'subs >= 50,000 AND avgViews < 500 (hard reject)',
      source: 'Gleemo AI',
    });
  }

  if (rejections.length > 0) {
    return {
      pass: false,
      reason: 'ENGAGEMENT_SANITY_FAIL',
      gate: 3,
      rejections,
      warnings,
    };
  }

  return { pass: true, warnings };
}

// ---------------------------------------------------------------------------
// Gate 4 -- LLM Relevance Check (Claude Haiku)
// ---------------------------------------------------------------------------

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

/**
 * Gate 4 -- Call Claude Haiku for a single-word relevance verdict.
 *
 * RELEVANT = men's grooming, beard care, hairstyling for men, men's skincare,
 *   male fashion / style / lifestyle.
 * IRRELEVANT = farming, medical, women's fashion / beauty / bridal, cooking,
 *   travel, gaming, sports, motivational without grooming focus,
 *   gender / social commentary.
 *
 * On API error the gate FAILS OPEN (pass: true with a warning) so that
 * network hiccups never block an otherwise-qualified channel.
 *
 * @param {string} channelDescription - First 500 chars of channel description.
 * @param {string[]} videoTitles - Up to 8 recent video titles.
 * @param {string} claudeApiKey - Anthropic API key.
 * @returns {Promise<{ pass: boolean, reason?: string, gate?: number, verdict?: string, warning?: string }>}
 */
async function gate4LlmRelevance(channelDescription, videoTitles, claudeApiKey) {
  const descSnippet = (channelDescription ?? '').slice(0, 500);
  const titles = (videoTitles ?? []).slice(0, 8);

  const userPrompt = [
    'You are a strict classifier. Given a YouTube channel description and recent video titles, reply with exactly one word: RELEVANT or IRRELEVANT.',
    '',
    'RELEVANT = the channel is primarily about men\'s grooming, beard care, hairstyling for men, men\'s skincare, men\'s fragrance/perfume, or explicitly male fashion-and-style reviews.',
    '',
    'IRRELEVANT (be strict — if in doubt, choose IRRELEVANT) = the channel is primarily about any of:',
    '- motivational, self-help, life-coaching, "decoding success", "growth revolution", mindset, or productivity content',
    '- spiritual, religious, Bhagavad Gita, Brahma Muhurta, sadhguru, monk, law-of-attraction, or manifestation content',
    '- study hacks, exam tips, academic topper strategies, Harvard rules, "stop wasting your life"',
    '- farming, medical, health/fitness-only, cooking, travel, gaming, sports, news, politics',
    '- women\'s fashion / beauty / bridal / makeup / saree / lehenga',
    '- tech / gadget / phone / laptop / electronics reviews',
    '- gender commentary, social commentary, or generic lifestyle/vlog content without grooming focus',
    '',
    'A channel that occasionally reviews a trimmer but is otherwise motivational or tech is IRRELEVANT.',
    '',
    `Channel description: ${descSnippet}`,
    '',
    `Recent video titles:\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
    '',
    'Reply with one word only: RELEVANT or IRRELEVANT.',
  ].join('\n');

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': claudeApiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 5,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      // Fail open on HTTP errors.
      return {
        pass: true,
        warning: `Gate 4 LLM call returned HTTP ${response.status}; failing open.`,
      };
    }

    const data = await response.json();
    const verdict = (data?.content?.[0]?.text ?? '').trim().toUpperCase();

    if (verdict.startsWith('IRRELEVANT')) {
      return {
        pass: false,
        reason: 'LLM_RELEVANCE_FAIL',
        gate: 4,
        verdict: 'IRRELEVANT',
      };
    }

    return { pass: true };
  } catch (err) {
    // Fail open on network / parse errors.
    return {
      pass: true,
      warning: `Gate 4 LLM call failed (${err.message}); failing open.`,
    };
  }
}

// ---------------------------------------------------------------------------
// Master Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run gates 1 through 4 in sequence, short-circuiting on the first rejection.
 *
 * @param {object} channel - Full YouTube `channels.list` resource.
 * @param {string[]} videoTitles - Array of recent video title strings.
 * @param {{ subscriberCount: number, avgViewsPerVideo: number, engagementRate: number }} metrics
 * @param {string|null|undefined} claudeApiKey - Anthropic API key; if falsy, Gate 4 is skipped.
 * @returns {Promise<{ passed: boolean, gateResults: { gate1: object, gate2: object, gate3: object, gate4: object }, failedAt: number|null }>}
 */
async function runAllGates(channel, videoTitles, metrics, claudeApiKey) {
  const gateResults = {
    gate1: null,
    gate2: null,
    gate3: null,
    gate4: null,
  };

  // Gate 1 -- Category blocker
  const g1 = gate1CategoryBlocker(channel);
  gateResults.gate1 = g1;
  if (!g1.pass) {
    return { passed: false, gateResults, failedAt: 1 };
  }

  // Gate 2 -- Gender mismatch
  const channelDescription = channel?.snippet?.description ?? '';
  const g2 = gate2GenderMismatch(channelDescription, videoTitles);
  gateResults.gate2 = g2;
  if (!g2.pass) {
    return { passed: false, gateResults, failedAt: 2 };
  }

  // Gate 3 -- Engagement sanity
  const g3 = gate3EngagementSanity(metrics);
  gateResults.gate3 = g3;
  if (!g3.pass) {
    return { passed: false, gateResults, failedAt: 3 };
  }

  // Gate 4 -- LLM relevance (skipped when no API key is provided)
  if (claudeApiKey) {
    const g4 = await gate4LlmRelevance(channelDescription, videoTitles, claudeApiKey);
    gateResults.gate4 = g4;
    if (!g4.pass) {
      return { passed: false, gateResults, failedAt: 4 };
    }
  } else {
    gateResults.gate4 = { pass: true, warning: 'Gate 4 skipped: no Claude API key provided.' };
  }

  return { passed: true, gateResults, failedAt: null };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  gate1CategoryBlocker,
  gate2GenderMismatch,
  gate3EngagementSanity,
  gate4LlmRelevance,
  runAllGates,
};
