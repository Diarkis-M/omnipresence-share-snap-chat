// ═══════════════════════════════════════════════════════════════════════════
// LANGUAGE DETECTION — Entry point for the 4-phase pipeline
//
// Input:  Array of raw comment strings
// Output: Language label + confidence + corpus-level metadata
//
// Pipeline:
//   [Comments] → scoreComment() → aggregateCorpus() → classifyAudience()
//
// Languages: HI TA TE MR BN ML KN PA GU OD Hinglish EN
// ═══════════════════════════════════════════════════════════════════════════

import { scoreComment } from './commentScorer';
import { aggregateCorpus } from './corpusAggregator';
import { classifyAudience } from './languageClassifier';

// Language code → full name mapping
export const LANGUAGE_LABELS = {
  HI: 'Hindi',
  TA: 'Tamil',
  TE: 'Telugu',
  MR: 'Marathi',
  BN: 'Bengali',
  ML: 'Malayalam',
  KN: 'Kannada',
  PA: 'Punjabi',
  GU: 'Gujarati',
  OD: 'Odia',
  EN: 'English',
  Hinglish: 'Mixed / Hinglish',
  mixed: 'Mixed / No dominant language',
};

// Full name → language code (reverse lookup for integration with youtube.js)
export const NAME_TO_CODE = {
  Hindi: 'HI',
  Tamil: 'TA',
  Telugu: 'TE',
  Marathi: 'MR',
  Bengali: 'BN',
  Malayalam: 'ML',
  Kannada: 'KN',
  Punjabi: 'PA',
  Gujarati: 'GU',
  Odia: 'OD',
  English: 'EN',
  'Mixed / Hinglish': 'Hinglish',
};

/**
 * Detect the dominant audience language for an influencer
 * based on their comment section.
 *
 * @param {string[]} comments - Array of raw comment strings
 * @returns {{ result: Object, corpus: Object }}
 *
 * result.label         → Language code string ('HI', 'TA', 'Hinglish', 'EN', 'mixed', null)
 * result.confidence    → 'high' | 'moderate' | 'low' | null
 * result.reason        → Machine-readable reason string
 * corpus.totalScore    → Per-language total weighted scores
 * corpus.coveragePct   → Fraction of comments with any signal per language
 * corpus.N             → Total comments analysed
 */
export function detectAudienceLanguage(comments) {
  if (!comments || comments.length === 0) {
    return {
      result: { label: null, confidence: null, reason: 'no_comments' },
      corpus: null,
    };
  }

  const scoreVectors = comments.map(scoreComment);
  const corpus = aggregateCorpus(scoreVectors);
  const result = classifyAudience(corpus);

  return { result, corpus };
}

/**
 * Bridge function: returns an array of detected language names (full names)
 * for backward compatibility with the existing youtube.js pipeline.
 *
 * Replaces the old simple regex-threshold-based detectCommentLanguages().
 *
 * @param {string[]} comments - Array of raw comment strings
 * @returns {string[]} Array of language names (e.g., ['Tamil', 'English'])
 */
export function detectCommentLanguagesV2(comments) {
  if (!comments || comments.length === 0) return [];

  const { result, corpus } = detectAudienceLanguage(comments);
  const detected = new Set();

  if (!corpus) return [];

  // Add the primary detected language
  if (result.label && result.label !== 'mixed') {
    const fullName = LANGUAGE_LABELS[result.label];
    if (fullName) detected.add(fullName);
  }

  // For 'mixed', add both top languages
  if (result.label === 'mixed' && result.top2) {
    for (const code of result.top2) {
      const fullName = LANGUAGE_LABELS[code];
      if (fullName) detected.add(fullName);
    }
  }

  // Also add any language with significant coverage (>15% of comments)
  // This catches secondary languages that aren't dominant but are present
  if (corpus.coveragePct) {
    for (const [code, pct] of Object.entries(corpus.coveragePct)) {
      if (pct >= 0.15 && corpus.totalScore[code] >= corpus.N * 1.0) {
        const fullName = LANGUAGE_LABELS[code];
        if (fullName) detected.add(fullName);
      }
    }
  }

  // English check: if >50% of comments have English tokens
  if (corpus.coveragePct['EN'] > 0.5) {
    detected.add('English');
  }

  return [...detected];
}

/**
 * Get rich detection metadata for display purposes.
 * Returns the full result + human-readable label + top language scores.
 *
 * @param {string[]} comments
 * @returns {{ label, displayName, confidence, reason, topScores, commentCount }}
 */
export function getDetectionDetails(comments) {
  const { result, corpus } = detectAudienceLanguage(comments);

  const displayName = result.label
    ? (LANGUAGE_LABELS[result.label] || result.label)
    : 'Undetected';

  // Top 3 languages by score for display
  const topScores = corpus
    ? Object.entries(corpus.totalScore)
        .filter(([, score]) => score > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([code, score]) => ({
          code,
          name: LANGUAGE_LABELS[code] || code,
          score,
          coveragePct: Math.round((corpus.coveragePct[code] || 0) * 100),
        }))
    : [];

  return {
    label: result.label,
    displayName,
    confidence: result.confidence,
    reason: result.reason,
    topScores,
    commentCount: corpus?.N || 0,
  };
}
