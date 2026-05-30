/**
 * Scoring engine — ShareChat-native data only, Haiku only.
 *
 * Single mode: scoreCandidate() calls Haiku if API key is set,
 * otherwise falls back to heuristic scoring from raw ShareChat metrics.
 *
 * Zero Snapchat/IG/YT fields. Zero Sonnet calls.
 */

import { scoreCreator } from './anthropic.js';

/**
 * ShareChat follower tiers — different from Snapchat subscribers.
 * ShareChat followers are lower-intent than Snap subscribers.
 * 50K ShareChat followers ~ 10K Snap subscribers in marketing value.
 */
export const SHARECHAT_FOLLOWER_TIERS = {
  nano:  { min: 1000,   max: 10000 },
  micro: { min: 10000,  max: 100000 },
  mid:   { min: 100000, max: 500000 },
  macro: { min: 500000, max: Infinity },
};

/**
 * Score a candidate using Haiku LLM or heuristic fallback.
 *
 * @param {Object} candidate - ShareChat-native candidate data
 * @param {string} brandContext - Brand description for LLM
 * @param {string} [apiKey] - Anthropic API key (if absent, uses heuristic)
 * @returns {Promise<Object>} Scoring result
 */
export async function scoreCandidate(candidate, brandContext, apiKey) {
  if (!apiKey) {
    return { mode: 'heuristic', ...computeHeuristicScore(candidate) };
  }

  try {
    const llmResult = await scoreCreator(candidate, brandContext, apiKey);
    return { mode: 'haiku', ...llmResult };
  } catch (err) {
    console.warn(`Haiku scoring failed for @${candidate.username}: ${err.message}`);
    return {
      mode: 'heuristic',
      ...computeHeuristicScore(candidate),
      _llmError: err.message,
    };
  }
}

/**
 * Heuristic fallback when Claude API is unavailable.
 * Scores from raw ShareChat-native metrics only.
 *
 * Signals used:
 * - followerCount -> tier bonus
 * - postCount -> activity bonus/penalty
 * - followingCount / followerCount -> organic growth signal
 * - isVerified -> small boost
 * - language match -> bonus for Indian regional languages
 * - bio keyword match -> bonus for grooming-related terms
 */
export function computeHeuristicScore(candidate) {
  let score = 50; // base

  const followers = typeof candidate.followerCount === 'number' ? candidate.followerCount : 0;
  const following = typeof candidate.followingCount === 'number' ? candidate.followingCount : 0;
  const posts = typeof candidate.postCount === 'number' ? candidate.postCount : 0;

  // Follower tier bonus
  if (followers >= 500000) score += 20;       // macro
  else if (followers >= 100000) score += 15;  // mid
  else if (followers >= 10000) score += 10;   // micro
  else if (followers >= 1000) score += 5;     // nano

  // Post count (activity indicator)
  if (posts > 50) score += 10;
  else if (posts > 20) score += 5;
  else if (posts < 3 && posts > 0) score -= 15;

  // Following/follower ratio (organic growth signal)
  if (followers > 0 && following > 0) {
    const ratio = following / followers;
    if (ratio < 0.1) score += 5;    // low following = organic growth
    else if (ratio > 5) score -= 10; // too much following = suspicious
  }

  // Verified boost
  if (candidate.isVerified) score += 5;

  // Language match — Indian regional language is a bonus (confirms India + vernacular)
  const indianLangs = new Set([
    'hindi', 'hi', 'tamil', 'ta', 'telugu', 'te', 'kannada', 'kn',
    'bengali', 'bn', 'marathi', 'mr', 'gujarati', 'gu', 'malayalam', 'ml',
    'punjabi', 'pa', 'odia', 'or', 'assamese', 'as', 'hinglish',
  ]);
  const lang = (candidate.language || '').toLowerCase();
  if (lang && indianLangs.has(lang)) score += 5;

  // Bio keyword match for grooming relevance
  const bio = (candidate.bio || '').toLowerCase();
  const groomingTerms = /\b(beard|grooming|skincare|hair|perfume|fragrance|deodorant|barber|salon|style|fashion|dadhi|baal)\b/;
  if (groomingTerms.test(bio)) score += 10;

  // Clamp 0-100
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Determine verdict
  let verdict;
  if (score >= 75) verdict = 'strong_candidate';
  else if (score >= 55) verdict = 'moderate_candidate';
  else if (score >= 35) verdict = 'weak_candidate';
  else verdict = 'skip';

  // Estimate cost tier from follower count (ShareChat rates are lower than IG/Snapchat)
  let estimatedCostTier;
  if (followers < 10000) estimatedCostTier = 'barter';
  else if (followers < 100000) estimatedCostTier = 'under_3k';
  else if (followers < 500000) estimatedCostTier = '3k_to_15k';
  else estimatedCostTier = '15k_to_50k';

  return {
    score,
    engagement: {
      rating: followers > 0 && following > 0
        ? ((following / followers) < 0.2 ? 'strong' : 'moderate')
        : 'unknown',
      note: followers > 0
        ? `${followers.toLocaleString()} followers, ${following} following`
        : 'No follower data',
    },
    reach: {
      rating: followers >= 100000 ? 'strong' : followers >= 10000 ? 'moderate' : 'weak',
      note: `${followers.toLocaleString()} followers`,
    },
    activity: {
      rating: posts > 50 ? 'strong' : posts > 10 ? 'moderate' : 'weak',
      note: `${posts} posts`,
    },
    brandFit: {
      rating: groomingTerms.test(bio) ? 'moderate' : 'unknown',
      note: bio ? `Bio: ${bio.slice(0, 60)}` : 'Heuristic mode — cannot assess brand fit without LLM',
    },
    verdict,
    reasoning: 'Heuristic score — Claude API unavailable',
    estimatedCostTier,
  };
}

/**
 * Get human-readable score label.
 */
export function getScoreLabel(score) {
  if (score >= 80) return 'Excellent';
  if (score >= 65) return 'Strong';
  if (score >= 50) return 'Moderate';
  if (score >= 35) return 'Weak';
  return 'Poor';
}

/**
 * Assign outreach priority rank to scored candidates.
 * Sorts by score descending, adds suggestedOutreachOrder.
 */
export function assignOutreachOrder(scoredCandidates) {
  const sorted = [...scoredCandidates].sort((a, b) => {
    const scoreA = a.score ?? 0;
    const scoreB = b.score ?? 0;
    return scoreB - scoreA;
  });

  return sorted.map((c, i) => ({
    ...c,
    suggestedOutreachOrder: i + 1,
  }));
}
