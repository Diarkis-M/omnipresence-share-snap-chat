// ═══════════════════════════════════════════════════════════════════════════
// CORPUS AGGREGATOR — Phase 2 of the 4-phase detection pipeline
// Sums per-comment score vectors into corpus-level statistics
// ═══════════════════════════════════════════════════════════════════════════

import { ALL_LANGS } from './commentScorer';

const ALL_OUTPUT_LANGS = [...ALL_LANGS, 'EN'];

/**
 * Aggregate individual comment score vectors into corpus-level statistics.
 *
 * @param {Array<Object>} commentScoreVectors - Array of score objects from scoreComment()
 * @returns {{ totalScore, coverage, avgScoreWhenPresent, coveragePct, N }}
 *
 * totalScore[lang]          — sum of all comment scores for that language
 * coverage[lang]            — count of comments that contributed any score > 0
 * avgScoreWhenPresent[lang] — mean score per comment, only counting comments where lang > 0
 * coveragePct[lang]         — fraction of total comments with any signal for this language
 * N                         — total number of comments analyzed
 */
export function aggregateCorpus(commentScoreVectors) {
  const totalScore = Object.fromEntries(ALL_OUTPUT_LANGS.map((l) => [l, 0]));
  const coverage = Object.fromEntries(ALL_OUTPUT_LANGS.map((l) => [l, 0]));

  for (const vec of commentScoreVectors) {
    for (const lang of ALL_OUTPUT_LANGS) {
      const s = vec[lang] || 0;
      totalScore[lang] += s;
      if (s > 0) coverage[lang]++;
    }
  }

  const N = commentScoreVectors.length;

  // Average score per comment, counting only comments where that language appeared
  const avgScoreWhenPresent = Object.fromEntries(
    ALL_OUTPUT_LANGS.map((l) => [
      l,
      coverage[l] > 0 ? totalScore[l] / coverage[l] : 0,
    ])
  );

  // Fraction of total comments that contributed any signal for this language
  const coveragePct = Object.fromEntries(
    ALL_OUTPUT_LANGS.map((l) => [l, N > 0 ? coverage[l] / N : 0])
  );

  return { totalScore, coverage, avgScoreWhenPresent, coveragePct, N };
}
