/**
 * Claude Haiku integration for ShareChat scouting pipeline.
 * ALL calls use Haiku — no Sonnet.
 *
 * Two functions:
 * 1. classifyRelevance() — binary gate (grooming-relevant or not?)
 * 2. scoreCreator()      — full scoring with dimensional breakdown
 *
 * Both operate on ShareChat-native data ONLY. Zero Snapchat/IG/YT fields.
 */

import Anthropic from '@anthropic-ai/sdk';

const HAIKU_MODELS = [
  'claude-haiku-4-5-20251001',  // primary
  'claude-3-5-haiku-20241022',  // fallback if primary deprecated
];

let _activeModel = HAIKU_MODELS[0];
let _modelFallbackTriggered = false;

/**
 * Call Haiku with automatic model fallback.
 * If primary model returns 404 (deprecated), try fallback.
 */
async function callHaiku(client, params) {
  for (let i = 0; i < HAIKU_MODELS.length; i++) {
    try {
      const result = await client.messages.create({
        ...params,
        model: HAIKU_MODELS[i],
      });
      if (i > 0 && !_modelFallbackTriggered) {
        _modelFallbackTriggered = true;
        console.warn(`[anthropic] Primary model unavailable, using fallback: ${HAIKU_MODELS[i]}`);
      }
      _activeModel = HAIKU_MODELS[i];
      return result;
    } catch (err) {
      if (err.status === 404 && i < HAIKU_MODELS.length - 1) {
        console.warn(`[anthropic] Model ${HAIKU_MODELS[i]} not found, trying fallback...`);
        continue;
      }
      throw err;
    }
  }
}

/** Get the currently active model name (for health reporting). */
export function getActiveModel() {
  return { model: _activeModel, fallbackTriggered: _modelFallbackTriggered };
}

/**
 * Gate G5: Binary relevance classification via Claude Haiku.
 * Determines if a ShareChat/Moj creator is relevant for men's grooming marketing.
 *
 * @param {Object} candidate - ShareChat-native candidate data
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<{ relevant: boolean, confidence: string, reasoning: string }>}
 */
export async function classifyRelevance(candidate, apiKey) {
  const client = new Anthropic({ apiKey });

  const username = candidate.username || candidate.handle || '';
  const displayName = candidate.displayName || '';
  const bio = candidate.bio || '';
  const country = candidate.country || '';
  const followers = candidate.followerCount || 'unknown';
  const snippet = candidate.googleSnippet || '';
  const language = candidate.language || '';
  const posts = candidate.postCount || 'unknown';

  // Build context — use whatever data is available
  const contextLines = [`Username: ${username}`];
  if (displayName) contextLines.push(`Display Name: ${displayName}`);
  if (bio) contextLines.push(`Bio: ${bio}`);
  if (country) contextLines.push(`Country: ${country}`);
  if (language) contextLines.push(`Content Language: ${language}`);
  if (followers !== 'unknown') contextLines.push(`Followers: ${followers}`);
  if (posts !== 'unknown') contextLines.push(`Posts: ${posts}`);
  if (snippet) contextLines.push(`Google Snippet: ${snippet}`);

  const message = await callHaiku(client, {
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `Classify this ShareChat/Moj creator as RELEVANT or IRRELEVANT for men's grooming product marketing in India (brands: beard care, face wash, hair styling, skincare, perfumes, deodorants).

${contextLines.join('\n')}

RELEVANT = men's grooming, beard care, hairstyling for men, men's skincare, men's fragrance, male style/lifestyle, barbering, personal care for men
IRRELEVANT = cooking/food, women's fashion/beauty, tech/electronics, gaming, news/politics, education, motivational/spiritual, generic entertainment

Respond in EXACTLY this JSON format (no extra text):
{"relevant": true, "confidence": "high", "reasoning": "one sentence"}`,
    }],
  });

  const text = message.content[0].text.trim();
  return parseJsonResponse(text, { relevant: false, confidence: 'low', reasoning: 'parse_error' });
}

/**
 * Full scoring via Claude Haiku.
 * Evaluates a ShareChat/Moj creator for GCPL men's grooming campaigns.
 *
 * @param {Object} candidate - ShareChat-native candidate data
 * @param {string} brandContext - Brand description
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<Object>} Scoring result with dimensional breakdown
 */
export async function scoreCreator(candidate, brandContext, apiKey) {
  const client = new Anthropic({ apiKey });

  const brand = brandContext || 'GCPL (Godrej Consumer Products) — Muuchstac, Cinthol, Park Avenue, Godrej Aer';
  const userMessage = buildScoringMessage(candidate, brand);

  const message = await callHaiku(client, {
    max_tokens: 600,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = message.content[0].text.trim();
  return parseJsonResponse(text, {
    score: 0,
    engagement: { rating: 'weak', note: 'parse_error' },
    reach: { rating: 'weak', note: 'parse_error' },
    activity: { rating: 'weak', note: 'parse_error' },
    brandFit: { rating: 'weak', note: 'parse_error' },
    verdict: 'skip',
    reasoning: 'Failed to parse LLM response',
    estimatedCostTier: 'unknown',
  });
}

function buildScoringMessage(candidate, brand) {
  const lines = [
    `You are evaluating a ShareChat/Moj creator for ${brand} men's grooming campaigns in India.`,
    `ShareChat is India's largest vernacular social media (325M MAU, 15 languages, 63-80% Tier 2/3/4 users).`,
    `Score this creator 0-100 based ONLY on the data provided.`,
    '',
    '── CREATOR DATA ──',
    `Username: ${candidate.username || 'unknown'}`,
  ];

  if (candidate.displayName) lines.push(`Display Name: ${candidate.displayName}`);
  if (candidate.bio) lines.push(`Bio: ${candidate.bio}`);
  if (candidate.followerCount) lines.push(`Followers: ${candidate.followerCount.toLocaleString()}`);
  if (candidate.followingCount) lines.push(`Following: ${candidate.followingCount.toLocaleString()}`);
  if (candidate.postCount) lines.push(`Posts: ${candidate.postCount}`);
  if (candidate.isVerified) lines.push(`Verified: Yes`);
  if (candidate.country) lines.push(`Country: ${candidate.country}`);
  if (candidate.language) lines.push(`Content Language: ${candidate.language}`);
  if (candidate.platform) lines.push(`Platform: ${candidate.platform}`);

  if (candidate.googleSnippet) {
    lines.push('', '── GOOGLE SNIPPET ──', candidate.googleSnippet);
  }

  lines.push('', `── SCORING GUIDE ──`);
  lines.push(`Engagement Quality (25%): follower-to-post ratio, following/follower ratio (organic growth signals)`);
  lines.push(`Reach Scale (30%): follower count, verified status, platform prominence`);
  lines.push(`Activity & Growth (25%): post count, posting regularity indicators`);
  lines.push(`Brand Fit (20%): bio relevance to men's grooming, language match to target markets`);
  lines.push('');
  lines.push('CALIBRATION: 50-65 = moderate, 65-80 = strong, 80+ = excellent. Most creators score 45-65.');
  lines.push('NOTE: ShareChat follower tiers differ from Instagram/Snapchat — 10K+ followers is significant on ShareChat.');
  lines.push('');
  lines.push(`Return ONLY valid JSON (no markdown, no backticks):
{
  "score": 0,
  "engagement": {"rating": "strong/moderate/weak", "note": ""},
  "reach": {"rating": "strong/moderate/weak", "note": ""},
  "activity": {"rating": "strong/moderate/weak", "note": ""},
  "brandFit": {"rating": "strong/moderate/weak", "note": ""},
  "verdict": "strong_candidate|moderate_candidate|weak_candidate|skip",
  "reasoning": "2 sentences max",
  "estimatedCostTier": "barter|under_3k|3k_to_15k|15k_to_50k|above_50k"
}`);

  return lines.join('\n');
}

/**
 * Tier 3 LLM extraction: Send cleaned HTML to Haiku for semantic profile data extraction.
 * Used when standards-based (Tier 1) and regex (Tier 2) extraction fail or produce suspicious results.
 *
 * @param {string} cleanedHtml - HTML with scripts/styles/nav stripped (~5-8KB)
 * @param {string} platform - 'sharechat' or 'snapchat'
 * @param {string} apiKey - Anthropic API key
 * @returns {Promise<Object>} Extracted profile data or { error: string }
 */
export async function extractProfileWithLLM(cleanedHtml, platform, apiKey) {
  const client = new Anthropic({ apiKey });

  const prompt = `Extract profile data from this ${platform} profile page HTML.
Return ONLY valid JSON with these fields:
{
  "displayName": "string",
  "followerCount": number,
  "followingCount": number,
  "postCount": number,
  "bio": "string",
  "isVerified": boolean,
  "language": "string or null"
}
Rules:
- followerCount/followingCount/postCount must be integers (not strings)
- Convert abbreviated numbers: "12.5K" → 12500, "1.3M" → 1300000, "1,234" → 1234
- If a field is not found in the HTML, use null
- Do not guess or infer values — only extract what is explicitly shown
- Do not return placeholder or example data

HTML:
${cleanedHtml.slice(0, 12000)}`;

  try {
    const message = await callHaiku(client, {
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text.trim();
    const result = parseJsonResponse(text, null);

    if (!result) {
      return { error: 'Failed to parse LLM extraction response' };
    }

    // Validate types
    if (result.followerCount !== null && typeof result.followerCount !== 'number') {
      result.followerCount = parseInt(String(result.followerCount).replace(/[,\s]/g, ''), 10) || null;
    }
    if (result.followingCount !== null && typeof result.followingCount !== 'number') {
      result.followingCount = parseInt(String(result.followingCount).replace(/[,\s]/g, ''), 10) || null;
    }
    if (result.postCount !== null && typeof result.postCount !== 'number') {
      result.postCount = parseInt(String(result.postCount).replace(/[,\s]/g, ''), 10) || null;
    }

    return result;
  } catch (err) {
    return { error: `LLM extraction failed: ${err.message}` };
  }
}

/**
 * Parse JSON from LLM response with fallback.
 */
function parseJsonResponse(text, fallback) {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch { /* continue */ }

  // Extract outermost {...} block
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch { /* continue */ }

    // Attempt repair: close unclosed braces
    let repaired = match[0];
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    if (openBraces > closeBraces) {
      repaired += '}'.repeat(openBraces - closeBraces);
    }
    try {
      return JSON.parse(repaired);
    } catch { /* give up */ }
  }

  console.warn(`Failed to parse LLM response: ${text.slice(0, 150)}`);
  return fallback;
}
