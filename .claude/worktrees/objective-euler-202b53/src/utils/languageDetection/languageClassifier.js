// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE CLASSIFIER — Phase 3 of the 4-phase detection pipeline
// Assigns a single language label with confidence from corpus statistics
// ═══════════════════════════════════════════════════════════════════════════

import { ALL_LANGS } from './commentScorer';

/**
 * Classify the dominant audience language from aggregated corpus data.
 *
 * @param {Object} corpus - Output from aggregateCorpus()
 * @returns {{ label, confidence, reason, ...metadata }}
 *
 * label      → Language code ('HI', 'TA', 'Hinglish', 'EN', 'mixed', null)
 * confidence → 'high' | 'moderate' | 'low' | 'low_sample' | null
 * reason     → Machine-readable classification reason
 *
 * Confidence tier reference:
 *   'high'       → N >= 25, dominant language > 1.5x second-place
 *   'moderate'   → N >= 25, dominant 1.15-1.5x second, or Hinglish condition
 *   'low'        → N >= 25, top two languages within 1.15x (near-tie)
 *   'low_sample' → 10 <= N < 25, regardless of signal strength (preliminary)
 *   null         → N < 10, or total signal below minimum threshold
 *
 * Threshold calibration notes (from LANGUAGE_DETECTION_CORRECTIONS.md):
 * - N < 10            → insufficient_data (raised from 5)
 * - 10 <= N < 25      → low_sample confidence cap
 * - topScore < N*1.5  → low_signal (weak markers overall)
 * - avgHI < 4.5       → Hinglish check (Hindi shallow)
 * - coverageHI < 0.50 → Hinglish check (Hindi sparse)
 * - EN > HI * 0.35    → Hinglish check (English co-present)
 * - top > 2nd * 1.5   → high confidence dominance
 * - top > 2nd * 1.15  → moderate confidence dominance
 */
export function classifyAudience(corpus) {
  const { totalScore, avgScoreWhenPresent, coveragePct, N } = corpus;

  // ── GUARD: Too few comments to make any determination ───────────────────
  // Raised from N < 5 to N < 10. Even a strong single marker repeated
  // across 5-9 comments is not a reliable audience signal.
  if (N < 10) {
    return {
      label: null,
      confidence: null,
      reason: 'insufficient_data',
      corpus,
    };
  }

  // ── Sample size flag ────────────────────────────────────────────────────
  // Results from 10-24 comments are preliminary. Confidence is capped at
  // 'low_sample' regardless of how dominant the signal appears.
  // The label is still returned — the frontend can render a warning badge.
  const isLowSample = N < 25;

  // ── Rank all Indian languages by total score (exclude EN from ranking) ──
  const ranked = ALL_LANGS
    .map((l) => ({ lang: l, score: totalScore[l] }))
    .sort((a, b) => b.score - a.score);

  const { lang: topLang, score: topScore } = ranked[0];
  const { lang: secondLang, score: secondScore } = ranked[1];

  // ── GUARD: No language signal at all ────────────────────────────────────
  // If even the top language averages < 1.5 points per comment, too weak
  if (topScore < N * 1.5) {
    if (totalScore['EN'] > topScore) {
      return {
        label: 'EN',
        confidence: isLowSample ? 'low_sample' : 'high',
        reason: 'english_dominant',
        corpus,
      };
    }
    return {
      label: null,
      confidence: null,
      reason: 'low_signal',
      corpus,
    };
  }

  // ── HINGLISH CHECK: Must run BEFORE declaring Hindi winner ──────────────
  // Hinglish = Hindi is technically top, but signal is shallow & sparse
  // with significant English co-presence
  if (topLang === 'HI') {
    const isHinglish = (
      avgScoreWhenPresent['HI'] < 4.5 &&
      coveragePct['HI'] < 0.50 &&
      totalScore['EN'] > totalScore['HI'] * 0.35
    );
    if (isHinglish) {
      return {
        label: 'Hinglish',
        confidence: isLowSample ? 'low_sample' : 'moderate',
        reason: 'hindi_shallow_english_copresent',
        corpus,
      };
    }
  }

  // ── DOMINANCE CHECK: High confidence ────────────────────────────────────
  if (topScore > secondScore * 1.5) {
    return {
      label: topLang,
      confidence: isLowSample ? 'low_sample' : 'high',
      reason: 'dominant_signal',
      topScore,
      secondScore,
      corpus,
    };
  }

  // ── DOMINANCE CHECK: Moderate confidence ────────────────────────────────
  if (topScore > secondScore * 1.15) {
    return {
      label: topLang,
      confidence: isLowSample ? 'low_sample' : 'moderate',
      reason: 'likely_dominant',
      topScore,
      secondScore,
      corpus,
    };
  }

  // ── NEAR-TIE: No clear dominant language ────────────────────────────────
  return {
    label: 'mixed',
    confidence: isLowSample ? 'low_sample' : 'low',
    top2: [topLang, secondLang],
    reason: 'no_clear_dominant',
    corpus,
  };
}
