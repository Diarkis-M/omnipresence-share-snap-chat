/**
 * Snapchat Scouting Pipeline — 5-Gate Sequential Validation
 *
 * All gates use Snap-native data ONLY. Zero IG/YT/inherited fields.
 * Gates ordered by cost (cheapest first, LLM last):
 *
 *   G1: Profile Existence
 *   G2: India Geo-Filter
 *   G3: Activity Check (Spotlight videos)
 *   G4: Fraud Detection (subscriber-to-view ratio)
 *   G5: Content Relevance via Claude Haiku
 */

import { isLikelyNonIndian, detectIndiaSignals, isLikelyBrandPage } from '../utils/india-detector.js';
import { classifyRelevance } from './anthropic.js';

/**
 * Gate G1: Profile must exist.
 * API-discovered creators auto-pass (the API returned them).
 * Google/seed candidates need HEAD validation.
 */
function gateProfileExists(candidate) {
  if (candidate.source === 'snap_api') {
    return { passed: true, signal: 'api_discovered' };
  }
  if (candidate.profileExists) {
    return { passed: true, signal: 'head_validated' };
  }
  return { passed: false, reason: 'Profile does not exist on Snapchat (HEAD returned non-200)' };
}

/**
 * Gate G2: India geo-filter.
 * API-discovered: auto-pass (already filtered by creator_l_90_country_codes=IN).
 * Google/seed: check bio + display name for India signals.
 */
function gateIndiaGeo(candidate) {
  // API candidates were already filtered by country=IN
  if (candidate.source === 'snap_api') {
    const country = (candidate.country || '').toLowerCase().trim();
    if (country === 'in' || country === 'india') {
      return { passed: true, signal: 'api_country:IN' };
    }
    // API returned this creator for IN query — trust the API
    return { passed: true, signal: 'api_country_filter' };
  }

  // For Google/seed candidates: check for explicit non-Indian signals
  const bio = candidate.bio || candidate.googleSnippet || '';
  const country = candidate.country || '';

  // Reject if clearly non-Indian
  if (isLikelyNonIndian(bio, country)) {
    return { passed: false, reason: 'Detected as non-Indian (foreign country/city in bio or snippet)' };
  }

  // Check for positive India signals
  const indiaCheck = detectIndiaSignals(bio, country, null);
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

  // No signals either way — pass (fail-open)
  return { passed: true, signal: 'no_foreign_signals' };
}

/**
 * Gate G3: Activity check.
 * Reject creators with zero Spotlight videos (inactive on public Snapchat).
 * Skip (pass) if no Spotlight data is available.
 */
function gateActivity(candidate) {
  if (!candidate.spotlightMetrics) {
    return { passed: true, note: 'No Spotlight data — skipped activity gate' };
  }

  const videoCount = candidate.spotlightMetrics.videoCount || 0;
  if (videoCount === 0) {
    return { passed: false, reason: 'No Spotlight videos — inactive on public Snapchat' };
  }

  return { passed: true, signal: `${videoCount} Spotlight videos` };
}

/**
 * Gate G4: Fraud detection.
 * Reject if avg views < 1% of subscribers (dead audience).
 * Skip (pass) if no data available.
 */
function gateFraud(candidate) {
  const subs = typeof candidate.subscriberCount === 'number' ? candidate.subscriberCount : 0;
  const metrics = candidate.spotlightMetrics;

  if (!metrics || subs === 0) {
    return { passed: true, note: 'No metrics data — skipped fraud gate' };
  }

  const avgViews = metrics.avgViewsPerVideo || 0;

  // Dead audience: avg views < 1% of subscribers (only check for accounts with meaningful subs)
  if (subs > 1000 && avgViews > 0 && (avgViews / subs) < 0.01) {
    const ratio = ((avgViews / subs) * 100).toFixed(2);
    return {
      passed: false,
      reason: `Dead audience: ${avgViews} avg views vs ${subs} subscribers (${ratio}%)`,
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
 * Run all gates (G1 → G5) sequentially.
 * Short-circuits on first failure.
 *
 * @param {Object} candidate - Snap-native candidate
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
