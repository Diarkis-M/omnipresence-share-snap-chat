'use client';

import { useState } from 'react';
import { getScoreColor, formatSubscribers, getVerdictLabel, getScoreBadgeClass, getFraudColor, getCostLabel } from '@/lib/scoring';

/**
 * CompareDrawer — floating bottom bar + expandable comparison table.
 *
 * When the user shortlists 2+ influencers, a sticky bar appears at the bottom
 * with avatars and a "Compare" button. Clicking it expands a full side-by-side
 * comparison panel with PCF scores, sentiment, fraud, and recommendation data.
 */
export default function CompareDrawer({ shortlistedResults, onRemove, onClearAll }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!shortlistedResults || shortlistedResults.length === 0) return null;

  const canCompare = shortlistedResults.length >= 2;

  // Find the winner for each PCF dimension (for highlighting)
  const dimensions = [
    { key: 'engagement_quality', label: 'Engagement Quality', weight: '25%' },
    { key: 'reach_relevance', label: 'Reach Relevance', weight: '25%' },
    { key: 'growth_potential', label: 'Growth Potential', weight: '20%' },
    { key: 'parasocial_depth', label: 'Parasocial Depth', weight: '18%' },
    { key: 'brand_fit', label: 'Brand Fit', weight: '12%' },
  ];

  const getWinner = (key) => {
    if (shortlistedResults.length < 2) return null;
    let maxScore = -1;
    let winnerId = null;
    shortlistedResults.forEach((r) => {
      const score = r.analysis.pcf_score[key]?.score ?? 0;
      if (score > maxScore) {
        maxScore = score;
        winnerId = r.channelId;
      }
    });
    // Check for tie
    const tied = shortlistedResults.filter(
      (r) => (r.analysis.pcf_score[key]?.score ?? 0) === maxScore
    );
    return tied.length > 1 ? null : winnerId;
  };

  const overallWinner = (() => {
    if (shortlistedResults.length < 2) return null;
    let maxScore = -1;
    let winnerId = null;
    shortlistedResults.forEach((r) => {
      if (r.analysis.pcf_score.overall > maxScore) {
        maxScore = r.analysis.pcf_score.overall;
        winnerId = r.channelId;
      }
    });
    const tied = shortlistedResults.filter(
      (r) => r.analysis.pcf_score.overall === maxScore
    );
    return tied.length > 1 ? null : winnerId;
  })();

  return (
    <>
      {/* Backdrop when expanded */}
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
          onClick={() => setIsExpanded(false)}
        />
      )}

      {/* The drawer */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${
          isExpanded ? 'top-16' : ''
        }`}
      >
        {/* Expanded comparison panel */}
        {isExpanded && (
          <div className="absolute inset-0 bg-white overflow-y-auto rounded-t-2xl shadow-2xl animate-slide-up">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Side-by-Side Comparison</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {shortlistedResults.length} influencers compared
                  </p>
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Comparison Table */}
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full border-collapse min-w-[640px]">
                  {/* Channel headers */}
                  <thead>
                    <tr>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-4 pr-4 w-40">
                        Metric
                      </th>
                      {shortlistedResults.map((r) => (
                        <th key={r.channelId} className="text-center pb-4 px-3 min-w-[160px]">
                          <div className="flex flex-col items-center gap-2">
                            {r.channelThumbnail ? (
                              <img
                                src={r.channelThumbnail}
                                alt={r.channelName}
                                className={`w-12 h-12 rounded-full object-cover ring-2 ${
                                  overallWinner === r.channelId ? 'ring-accent' : 'ring-gray-200'
                                }`}
                              />
                            ) : (
                              <div className={`w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center ring-2 ${
                                overallWinner === r.channelId ? 'ring-accent' : 'ring-gray-200'
                              }`}>
                                <span className="text-gray-500 font-bold">{r.channelName.charAt(0)}</span>
                              </div>
                            )}
                            <div className="text-center">
                              <a
                                href={r.platform === 'instagram'
                                  ? `https://instagram.com/${r._instagramData?.username || r.channelName}`
                                  : `https://youtube.com/channel/${r.channelId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-bold text-gray-800 hover:text-accent transition-colors line-clamp-1"
                              >
                                {r.channelName}
                              </a>
                              {overallWinner === r.channelId && (
                                <div className="flex items-center justify-center gap-1 mt-1">
                                  <svg className="w-3.5 h-3.5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  <span className="text-[10px] font-semibold text-accent uppercase tracking-wide">Best Match</span>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => onRemove(r.channelId)}
                              className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {/* Overall PCF Score */}
                    <tr className="bg-gray-50/80">
                      <td className="py-3 pr-4 text-sm font-bold text-gray-700">Overall PCF Score</td>
                      {shortlistedResults.map((r) => (
                        <td key={r.channelId} className="py-3 px-3 text-center">
                          <span
                            className={`text-2xl font-extrabold ${overallWinner === r.channelId ? 'scale-110 inline-block' : ''}`}
                            style={{ color: getScoreColor(r.analysis.pcf_score.overall) }}
                          >
                            {r.analysis.pcf_score.overall}
                          </span>
                        </td>
                      ))}
                    </tr>

                    {/* PCF Dimensions */}
                    {dimensions.map((dim) => {
                      const winner = getWinner(dim.key);
                      return (
                        <tr key={dim.key}>
                          <td className="py-3 pr-4">
                            <div className="text-sm font-medium text-gray-700">{dim.label}</div>
                            <div className="text-[10px] text-gray-400">{dim.weight} weight</div>
                          </td>
                          {shortlistedResults.map((r) => {
                            const score = r.analysis.pcf_score[dim.key]?.score ?? 0;
                            const isWinner = winner === r.channelId;
                            return (
                              <td key={r.channelId} className="py-3 px-3 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`text-lg font-bold ${isWinner ? '' : 'text-gray-600'}`}
                                      style={isWinner ? { color: getScoreColor(score) } : {}}
                                    >
                                      {score}
                                    </span>
                                    {isWinner && (
                                      <svg className="w-3.5 h-3.5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                      </svg>
                                    )}
                                  </div>
                                  {/* Mini bar */}
                                  <div className="w-full max-w-[100px] h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-500"
                                      style={{
                                        width: `${score}%`,
                                        backgroundColor: getScoreColor(score),
                                      }}
                                    />
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}

                    {/* Divider */}
                    <tr><td colSpan={shortlistedResults.length + 1} className="py-1" /></tr>

                    {/* Verdict */}
                    <tr className="bg-gray-50/80">
                      <td className="py-3 pr-4 text-sm font-medium text-gray-700">Verdict</td>
                      {shortlistedResults.map((r) => (
                        <td key={r.channelId} className="py-3 px-3 text-center">
                          <span className={`badge ${getScoreBadgeClass(r.analysis.recommendation.verdict)}`}>
                            {getVerdictLabel(r.analysis.recommendation.verdict)}
                          </span>
                        </td>
                      ))}
                    </tr>

                    {/* Subscribers */}
                    <tr>
                      <td className="py-3 pr-4 text-sm font-medium text-gray-700">
                        {shortlistedResults.every(r => r.platform === 'instagram') ? 'Followers' :
                         shortlistedResults.some(r => r.platform === 'instagram') ? 'Followers / Subs' : 'Subscribers'}
                      </td>
                      {shortlistedResults.map((r) => (
                        <td key={r.channelId} className="py-3 px-3 text-center text-sm font-medium text-gray-700">
                          {formatSubscribers(r.subscriberCount)}
                        </td>
                      ))}
                    </tr>

                    {/* Sentiment */}
                    <tr className="bg-gray-50/80">
                      <td className="py-3 pr-4 text-sm font-medium text-gray-700">Sentiment</td>
                      {shortlistedResults.map((r) => {
                        const s = r.analysis.sentiment_breakdown;
                        return (
                          <td key={r.channelId} className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-2 text-xs">
                              <span className="text-green-600 font-medium">{s.positive_percent}%</span>
                              <span className="text-gray-400">/</span>
                              <span className="text-gray-500">{s.neutral_percent}%</span>
                              <span className="text-gray-400">/</span>
                              <span className="text-red-500 font-medium">{s.negative_percent}%</span>
                            </div>
                            <div className="flex h-1.5 w-full max-w-[120px] mx-auto rounded-full overflow-hidden mt-1.5">
                              <div className="bg-green-400" style={{ width: `${s.positive_percent}%` }} />
                              <div className="bg-gray-300" style={{ width: `${s.neutral_percent}%` }} />
                              <div className="bg-red-400" style={{ width: `${s.negative_percent}%` }} />
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Fraud Risk */}
                    <tr>
                      <td className="py-3 pr-4 text-sm font-medium text-gray-700">Fraud Risk</td>
                      {shortlistedResults.map((r) => (
                        <td key={r.channelId} className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: getFraudColor(r.analysis.fraud_signals.risk_level) }}
                            />
                            <span className="text-sm capitalize text-gray-700">
                              {r.analysis.fraud_signals.risk_level}
                            </span>
                          </div>
                        </td>
                      ))}
                    </tr>

                    {/* Content Niche */}
                    <tr className="bg-gray-50/80">
                      <td className="py-3 pr-4 text-sm font-medium text-gray-700">Primary Niche</td>
                      {shortlistedResults.map((r) => (
                        <td key={r.channelId} className="py-3 px-3 text-center text-xs text-gray-600">
                          {r.analysis.content_classification.primary_niche}
                        </td>
                      ))}
                    </tr>

                    {/* Language Mix */}
                    <tr>
                      <td className="py-3 pr-4 text-sm font-medium text-gray-700">Language</td>
                      {shortlistedResults.map((r) => (
                        <td key={r.channelId} className="py-3 px-3 text-center text-xs text-gray-600">
                          {r.analysis.content_classification.language_mix}
                        </td>
                      ))}
                    </tr>

                    {/* Estimated Cost */}
                    <tr className="bg-gray-50/80">
                      <td className="py-3 pr-4 text-sm font-medium text-gray-700">Est. Cost Tier</td>
                      {shortlistedResults.map((r) => (
                        <td key={r.channelId} className="py-3 px-3 text-center text-sm font-medium text-gray-700">
                          {getCostLabel(r.analysis.recommendation.estimated_cost_tier)}
                        </td>
                      ))}
                    </tr>

                    {/* Suggested Format */}
                    <tr>
                      <td className="py-3 pr-4 text-sm font-medium text-gray-700">Suggested Format</td>
                      {shortlistedResults.map((r) => (
                        <td key={r.channelId} className="py-3 px-3 text-center text-xs text-gray-600">
                          {r.analysis.recommendation.suggested_content_format}
                        </td>
                      ))}
                    </tr>

                    {/* One-line Summary */}
                    <tr className="bg-gray-50/80">
                      <td className="py-3 pr-4 text-sm font-medium text-gray-700">AI Summary</td>
                      {shortlistedResults.map((r) => (
                        <td key={r.channelId} className="py-3 px-3 text-center text-xs text-gray-500 italic">
                          &ldquo;{r.analysis.recommendation.one_line_summary}&rdquo;
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Floating bottom bar */}
        {!isExpanded && (
          <div className="bg-navy/95 backdrop-blur-md border-t border-white/10 shadow-2xl px-4 py-3 animate-fade-up">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Stacked avatars */}
                <div className="flex -space-x-2">
                  {shortlistedResults.slice(0, 5).map((r, i) => (
                    r.channelThumbnail ? (
                      <img
                        key={r.channelId}
                        src={r.channelThumbnail}
                        alt={r.channelName}
                        className="w-8 h-8 rounded-full object-cover ring-2 ring-navy"
                        style={{ zIndex: shortlistedResults.length - i }}
                      />
                    ) : (
                      <div
                        key={r.channelId}
                        className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center ring-2 ring-navy text-white text-xs font-bold"
                        style={{ zIndex: shortlistedResults.length - i }}
                      >
                        {r.channelName.charAt(0)}
                      </div>
                    )
                  ))}
                  {shortlistedResults.length > 5 && (
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center ring-2 ring-navy text-white text-[10px] font-bold">
                      +{shortlistedResults.length - 5}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm text-white font-medium">
                    {shortlistedResults.length} shortlisted
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {canCompare ? 'Ready to compare' : 'Add 1 more to compare'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClearAll}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Clear all
                </button>
                <button
                  onClick={() => canCompare && setIsExpanded(true)}
                  disabled={!canCompare}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    canCompare
                      ? 'bg-gradient-to-r from-godrej-sky to-godrej-blue text-white shadow-lg shadow-godrej-sky/20 hover:opacity-90'
                      : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Compare
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
