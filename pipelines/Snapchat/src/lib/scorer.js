/**
 * Scoring engine — Snap-native data only, Haiku only.
 *
 * Single mode: scoreCandidate() calls Haiku if API key is set,
 * otherwise falls back to heuristic scoring from raw Snap metrics.
 *
 * Zero IG/YT/inherited fields. Zero Sonnet calls.
 */

import { scoreCreator } from './anthropic.js';
import { SNAP_SUBSCRIBER_TIERS } from './snap-api-client.js';

/**
 * Score a candidate using Haiku LLM or heuristic fallback.
 *
 * @param {Object} candidate - Snap-native candidate data
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
 * Scores from raw Snap-native metrics only.
 *
 * Signals used:
 * - subscriberCount → tier bonus
 * - spotlightMetrics.videoCount → activity bonus/penalty
 * - spotlightMetrics.avgViewsPerVideo / subscriberCount → engagement ratio
 * - isVerified → small boost
 */
export function computeHeuristicScore(candidate) {
  let score = 50; // base

  const subs = typeof candidate.subscriberCount === 'number' ? candidate.subscriberCount : 0;
  const metrics = candidate.spotlightMetrics;

  // Subscriber tier bonus
  if (subs >= 250000) score += 20;       // macro
  else if (subs >= 50000) score += 15;   // mid
  else if (subs >= 5000) score += 10;    // micro
  // nano: no bonus

  // Spotlight activity
  if (metrics) {
    const vids = metrics.videoCount || 0;
    if (vids > 10) score += 10;
    else if (vids > 5) score += 5;
    else if (vids === 0) score -= 20;

    // View-to-subscriber ratio
    const avgViews = metrics.avgViewsPerVideo || 0;
    if (subs > 0 && avgViews > 0) {
      const ratio = avgViews / subs;
      if (ratio > 0.10) score += 15;       // >10% — excellent engagement
      else if (ratio > 0.05) score += 10;  // >5%
      else if (ratio > 0.01) score += 5;   // >1%
      else score -= 10;                     // <1% — dead audience
    }
  } else {
    // No metrics at all (Google/seed candidates) — slight penalty
    score -= 5;
  }

  // Verified boost
  if (candidate.isVerified) score += 5;

  // Clamp 0-100
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Determine verdict
  let verdict;
  if (score >= 75) verdict = 'strong_candidate';
  else if (score >= 55) verdict = 'moderate_candidate';
  else if (score >= 35) verdict = 'weak_candidate';
  else verdict = 'skip';

  // Estimate cost tier from subscriber count
  let estimatedCostTier;
  if (subs < 5000) estimatedCostTier = 'barter';
  else if (subs < 50000) estimatedCostTier = 'under_5k';
  else if (subs < 250000) estimatedCostTier = '5k_to_20k';
  else estimatedCostTier = '20k_to_50k';

  return {
    score,
    engagement: {
      rating: metrics?.avgViewsPerVideo && subs > 0
        ? ((metrics.avgViewsPerVideo / subs) > 0.05 ? 'strong' : 'moderate')
        : 'unknown',
      note: metrics ? `${metrics.avgViewsPerVideo || 0} avg views, ${subs} subs` : 'No metrics',
    },
    reach: {
      rating: subs >= 50000 ? 'strong' : subs >= 5000 ? 'moderate' : 'weak',
      note: `${subs.toLocaleString()} subscribers`,
    },
    activity: {
      rating: metrics?.videoCount > 10 ? 'strong' : metrics?.videoCount > 3 ? 'moderate' : 'weak',
      note: metrics ? `${metrics.videoCount} Spotlight videos` : 'No Spotlight data',
    },
    brandFit: {
      rating: 'unknown',
      note: 'Heuristic mode — cannot assess brand fit without LLM',
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
