/**
 * ShareChat Scouting Pipeline — 5-Gate Sequential Validation
 *
 * All gates use ShareChat-native data ONLY. Zero Snapchat/IG/YT fields.
 * Gates ordered by cost (cheapest first, LLM last):
 *
 *   G1: Profile Existence
 *   G2: India Geo-Filter (+ language auto-pass)
 *   G3: Activity Check (post count)
 *   G4: Fraud Detection (follower/following ratio)
 *   G5: Content Relevance via Claude Haiku
 */

import { isLikelyNonIndian, detectIndiaSignals, isLikelyBrandPage } from '../utils/india-detector.js';
import { classifyRelevance } from './anthropic.js';

/**
 * Indian languages recognized by ShareChat.
 * If a creator's language is in this set, they auto-pass the India geo gate.
 */
const INDIAN_LANGUAGES = new Set([
  'hindi', 'hi', 'tamil', 'ta', 'telugu', 'te', 'kannada', 'kn',
  'bengali', 'bn', 'marathi', 'mr', 'gujarati', 'gu', 'malayalam', 'ml',
  'punjabi', 'pa', 'odia', 'or', 'assamese', 'as', 'hinglish',
]);

/**
 * Gate G1: Profile must exist.
 * Tag-API-discovered creators auto-pass (the API returned them).
 * Google/seed candidates need HEAD validation.
 */
function gateProfileExists(candidate) {
  if (candidate.source === 'sharechat_tag_api') {
    return { passed: true, signal: 'tag_api_discovered' };
  }
  if (candidate.profileExists) {
    return { passed: true, signal: 'head_validated' };
  }
  return { passed: false, reason: 'Profile does not exist on ShareChat (HEAD returned non-200)' };
}

/**
 * Gate G2: India geo-filter.
 * ShareChat is India-first (98%+ users are Indian), so this gate is lenient.
 * Auto-pass if language is Indian. Otherwise check bio/display name.
 */
function gateIndiaGeo(candidate) {
  // ShareChat creators using an Indian language → auto-pass
  const lang = (candidate.language || '').toLowerCase().trim();
  if (lang && INDIAN_LANGUAGES.has(lang)) {
    return { passed: true, signal: `language:${lang}` };
  }

  // Check for explicit non-Indian signals
  const bio = candidate.bio || candidate.googleSnippet || '';
  const country = candidate.country || '';

  if (isLikelyNonIndian(bio, country)) {
    return { passed: false, reason: 'Detected as non-Indian (foreign country/city in bio or snippet)' };
  }

  // Check for positive India signals
  const indiaCheck = detectIndiaSignals(bio, country, lang || null);
  if (indiaCheck.hasSignal) {
    return { passed: true, signal: indiaCheck.signals.join(', ') };
  }

  // Google-discovered with India-targeted queries: default pass
  if (candidate.source === 'google_cse') {
    return { passed: true, signal: 'default_pass:google_india_query' };
  }

  // Manual seeds: default pass (manually curated)
  if (candidate.source === 'manual_seed') {
    return { passed: true, signal: 'default_pass:manual_seed' };
  }

  // ShareChat is ~98% Indian users — default pass (very lenient)
  return { passed: true, signal: 'default_pass:sharechat_is_india_first' };
}

/**
 * Gate G3: Activity check.
 * Reject creators with fewer than 3 posts (too little content to assess).
 * Skip (pass) if no post count data is available.
 */
function gateActivity(candidate) {
  const postCount = candidate.postCount;

  if (postCount === null || postCount === undefined) {
    return { passed: true, note: 'No post count data — skipped activity gate' };
  }

  if (postCount === 0) {
    return { passed: false, reason: 'Zero posts — inactive on ShareChat' };
  }

  if (postCount < 3) {
    return { passed: false, reason: `Only ${postCount} posts — too minimal to assess` };
  }

  return { passed: true, signal: `${postCount} posts` };
}

/**
 * Gate G4: Fraud detection.
 * ShareChat-specific fraud signals:
 *   - High followers + very few posts → inflated followers
 *   - Following/follower ratio > 10 → follow-for-follow pattern
 *   - Brand page detection from bio
 */
function gateFraud(candidate) {
  const followers = typeof candidate.followerCount === 'number' ? candidate.followerCount : 0;
  const following = typeof candidate.followingCount === 'number' ? candidate.followingCount : 0;
  const posts = typeof candidate.postCount === 'number' ? candidate.postCount : 0;

  // Inflated followers: >50K followers but fewer than 5 posts
  if (followers > 50000 && posts > 0 && posts < 5) {
    return {
      passed: false,
      reason: `Inflated followers: ${followers.toLocaleString()} followers but only ${posts} posts`,
    };
  }

  // Follow-for-follow pattern: following/follower ratio > 10
  if (followers > 0 && following > 0 && (following / followers) > 10) {
    const ratio = (following / followers).toFixed(1);
    return {
      passed: false,
      reason: `Follow-for-follow pattern: ${following} following vs ${followers} followers (ratio: ${ratio}x)`,
    };
  }

  // Brand page detection from bio
  if (candidate.bio && isLikelyBrandPage(candidate.bio)) {
    return { passed: false, reason: 'Detected as brand page, not individual creator' };
  }

  return { passed: true };
}

/**
 * Gate G5: Content relevance via Claude Haiku.
 * Binary RELEVANT/IRRELEVANT verdict.
 * Fails OPEN on API errors (pass with warning).
 * THIS IS THE LAST GATE — most expensive, run only after all cheap gates pass.
 */
async function gateContentRelevance(candidate, anthropicApiKey) {
  if (!anthropicApiKey) {
    return { passed: true, note: 'No ANTHROPIC_API_KEY — skipped LLM relevance gate' };
  }

  try {
    const result = await classifyRelevance(candidate, anthropicApiKey);
    if (result.relevant) {
      return { passed: true, signal: `haiku:relevant (${result.confidence})` };
    } else {
      return { passed: false, reason: `Haiku: irrelevant — ${result.reasoning}` };
    }
  } catch (err) {
    // Fail OPEN — network errors should not block qualified creators
    return { passed: true, note: `LLM gate error (fail-open): ${err.message}` };
  }
}

/**
 * Run all gates (G1 -> G5) sequentially.
 * Short-circuits on first failure.
 *
 * @param {Object} candidate - ShareChat-native candidate
 * @param {string} [anthropicApiKey] - For G5 LLM gate
 * @returns {Promise<{ passed: boolean, failedAt: string|null, results: Array }>}
 */
export async function runGates(candidate, anthropicApiKey) {
  const results = [];

  // G1: Profile existence (cheapest)
  const g1 = gateProfileExists(candidate);
  results.push({ gate: 'G1:Existence', ...g1 });
  if (!g1.passed) return { passed: false, failedAt: 'G1', results };

  // G2: India geo
  const g2 = gateIndiaGeo(candidate);
  results.push({ gate: 'G2:IndiaGeo', ...g2 });
  if (!g2.passed) return { passed: false, failedAt: 'G2', results };

  // G3: Activity
  const g3 = gateActivity(candidate);
  results.push({ gate: 'G3:Activity', ...g3 });
  if (!g3.passed) return { passed: false, failedAt: 'G3', results };

  // G4: Fraud
  const g4 = gateFraud(candidate);
  results.push({ gate: 'G4:Fraud', ...g4 });
  if (!g4.passed) return { passed: false, failedAt: 'G4', results };

  // G5: Content relevance (most expensive — LLM call)
  const g5 = await gateContentRelevance(candidate, anthropicApiKey);
  results.push({ gate: 'G5:Relevance', ...g5 });
  if (!g5.passed) return { passed: false, failedAt: 'G5', results };

  return {
    passed: true,
    failedAt: null,
    results,
    staleData: candidate._extraction?.stale || false,
  };
}
