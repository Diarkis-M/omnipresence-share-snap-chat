// ═══════════════════════════════════════════════════════════════════════════
// PER-COMMENT SCORER — Phase 1 of the 4-phase detection pipeline
// Runs all four signal channels on a single comment → score vector
// ═══════════════════════════════════════════════════════════════════════════

import {
  DIAGNOSTIC_ANCHORS,
  EXCLUSIVE_VOCAB,
  MORPHO_PATTERNS,
  DISAMBIGUATION_MAP,
} from './languageMarkers';

export const ALL_LANGS = ['HI', 'TA', 'TE', 'MR', 'BN', 'ML', 'KN', 'PA', 'GU', 'OD'];

// Allowlist approach: only count tokens that are confirmed English.
// This prevents brand names, product category nouns, and common Indian words
// outside the marker file from inflating the EN score.
//
// Two categories:
//   1. English function/discourse words (high frequency in code-mixed comments)
//   2. English vocabulary specific to product reviews and social media
//
// Do NOT add product names, brand names, or transliterated Indian words here.
const ENGLISH_INDICATORS = new Set([
  // Pronouns and determiners
  'the', 'this', 'that', 'these', 'those', 'its', 'their',
  'your', 'our', 'his', 'her', 'they', 'them', 'who', 'which',
  // Copulas and auxiliaries
  'is', 'are', 'was', 'were', 'have', 'has', 'had',
  'will', 'would', 'could', 'should', 'can', 'may', 'might',
  // Negation and discourse
  'not', 'never', 'always', 'also', 'too', 'only', 'even',
  'just', 'really', 'very', 'actually', 'honestly', 'literally',
  // Conjunctions and prepositions
  'and', 'but', 'for', 'with', 'from', 'about', 'like', 'than',
  'when', 'where', 'because', 'so', 'then', 'now', 'here',
  // Evaluative adjectives (common in product reviews)
  'good', 'bad', 'best', 'worst', 'nice', 'great', 'amazing',
  'awesome', 'excellent', 'terrible', 'horrible', 'perfect',
  'okay', 'fine', 'poor', 'average',
  // Review-specific verbs
  'use', 'used', 'using', 'try', 'tried', 'buy', 'bought',
  'love', 'hate', 'like', 'recommend', 'suggest',
  // Review-specific nouns
  'product', 'quality', 'price', 'value', 'money', 'delivery',
  'packaging', 'fragrance', 'smell', 'texture', 'skin', 'hair',
  // Degree and intensifiers
  'definitely', 'absolutely', 'totally', 'completely', 'highly',
  // Social media discourse
  'please', 'thank', 'thanks', 'sorry', 'well', 'wow',
  'guys', 'everyone', 'people',
]);

function isLikelyEnglish(token) {
  return ENGLISH_INDICATORS.has(token);
}

/**
 * Score a single comment across all 4 signal channels.
 * Returns a score vector: { HI: n, TA: n, ..., EN: n }
 */
export function scoreComment(rawComment) {
  // Strip HTML tags (YouTube comments contain markup) and normalize
  const comment = rawComment
    .replace(/<[^>]*>/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ');
  const tokens = comment.split(/\s+/).filter(Boolean);

  // Initialize score vector
  const scores = Object.fromEntries([...ALL_LANGS, 'EN'].map((l) => [l, 0]));

  // ── CHANNEL DA: Diagnostic Anchors — weight 4 ──────────────────────────
  for (const lang of ALL_LANGS) {
    const anchors = Object.values(DIAGNOSTIC_ANCHORS[lang]).flat();
    for (const token of tokens) {
      if (anchors.includes(token)) {
        scores[lang] += 4;
      }
    }
  }

  // ── CHANNEL EV: Exclusive Vocabulary — weight 3 ────────────────────────
  for (const lang of ALL_LANGS) {
    const vocab = EXCLUSIVE_VOCAB[lang];
    const singleWords = vocab.filter((v) => !v.includes(' '));
    const phrases = vocab.filter((v) => v.includes(' '));

    // Single-word matching
    for (const token of tokens) {
      if (singleWords.includes(token)) {
        scores[lang] += 3;
      }
    }
    // Multi-word phrase matching (e.g., 'kem cho', 'sat sri akal')
    for (const phrase of phrases) {
      if (comment.includes(phrase)) {
        scores[lang] += 3;
      }
    }
  }

  // ── CHANNEL MP: Morphophonological Patterns — weight per pattern ───────
  for (const lang of ALL_LANGS) {
    const patterns = MORPHO_PATTERNS[lang] || [];
    for (const { pattern, weight } of patterns) {
      const matches = comment.match(new RegExp(pattern.source, pattern.flags + 'g'));
      if (matches) {
        scores[lang] += matches.length * weight;
      }
    }
  }

  // ── CHANNEL CS: Confirmed Shared Tokens — weight 1 ─────────────────────
  for (const [sharedToken, langRules] of Object.entries(DISAMBIGUATION_MAP)) {
    if (!tokens.includes(sharedToken)) continue;

    for (const [lang, confirmingTokens] of Object.entries(langRules)) {
      const confirmed = confirmingTokens.some((ct) => tokens.includes(ct));
      if (confirmed) {
        scores[lang] += 1;
      }
    }
  }

  // ── ENGLISH SCORING ─────────────────────────────────────────────────────
  scores['EN'] = tokens.filter(isLikelyEnglish).length;

  return scores;
}
