'use client';

import { useState } from 'react';
import ScoreBar from './ScoreBar';
import SentimentChart from './SentimentChart';
import {
  formatSubscribers,
  formatViews,
  getScoreColor,
  getScoreLabel,
  getScoreBadgeClass,
  getVerdictLabel,
  getFraudColor,
  getCostLabel,
} from '@/lib/scoring';

// Strip HTML tags to prevent XSS from YouTube comment markup
function sanitizeComment(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
}

export default function InfluencerCard({ result, rank, isTopPick, isShortlisted, onToggleShortlist }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const { analysis } = result;

  const isInstagram = result.platform === 'instagram';
  const igData = result._instagramData || {};

  const profileUrl = isInstagram
    ? `https://instagram.com/${igData.username || result.channelName}`
    : `https://youtube.com/channel/${result.channelId}`;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = profileUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Safety guard — incomplete analysis data must not crash the entire results page
  if (!analysis?.pcf_score) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-200 flex items-center justify-center">
            <span className="text-gray-400 text-xs font-bold">#{rank}</span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">{result.channelName}</p>
            <p className="text-xs text-gray-400">Analysis data incomplete — channel skipped</p>
          </div>
        </div>
      </div>
    );
  }

  const pcf = analysis.pcf_score;
  const scoreColor = getScoreColor(pcf.overall);

  return (
    <div className={`bg-white rounded-xl shadow-sm card-hover overflow-hidden ${
      isTopPick ? 'border-2 border-accent/40 ring-1 ring-accent/10' : 'border border-gray-100'
    }`}>
      {/* Main Card */}
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap sm:flex-nowrap items-start gap-3 sm:gap-4">
          {/* Shortlist Star */}
          {onToggleShortlist && (
            <button
              onClick={onToggleShortlist}
              className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                isShortlisted
                  ? 'bg-amber-50 text-amber-500'
                  : 'bg-gray-50 text-gray-300 hover:text-amber-400 hover:bg-amber-50'
              }`}
              title={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
            >
              <svg className="w-5 h-5" fill={isShortlisted ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          )}

          {/* Rank */}
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-navy flex items-center justify-center">
            <span className="text-white text-xs font-bold">#{rank}</span>
          </div>

          {/* Channel Avatar */}
          <div className="flex-shrink-0">
            {result.channelThumbnail ? (
              <img
                src={result.channelThumbnail}
                alt={result.channelName}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-100"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center ring-2 ring-gray-100">
                <span className="text-gray-500 font-bold text-lg">
                  {result.channelName.charAt(0)}
                </span>
              </div>
            )}
          </div>

          {/* Channel Info */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Name + platform + copy */}
            <div className="flex items-center gap-2">
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-bold text-gray-800 hover:text-accent transition-colors truncate"
              >
                {isInstagram ? `@${igData.username || result.channelName}` : result.channelName}
              </a>
              {isInstagram ? (
                <span className="flex-shrink-0 badge bg-gradient-to-r from-pink-50 to-purple-50 text-pink-600 border border-pink-200 text-[10px]">
                  Instagram
                </span>
              ) : (
                <span className="flex-shrink-0 badge bg-red-50 text-red-600 border border-red-200 text-[10px]">
                  YouTube
                </span>
              )}
              <button
                onClick={handleCopyUrl}
                className="text-gray-400 hover:text-accent transition-colors flex-shrink-0"
                title="Copy profile URL"
              >
                {copied ? (
                  <span className="text-accent text-xs font-medium">Copied!</span>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Row 2: Clean stats */}
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
              <span>{formatSubscribers(result.subscriberCount)} {isInstagram ? 'followers' : 'subscribers'}</span>
              <span className="w-1 h-1 bg-gray-300 rounded-full" />
              {isInstagram ? (
                <>
                  <span>{igData.engagementRate || 'N/A'} eng.</span>
                  <span className="w-1 h-1 bg-gray-300 rounded-full" />
                  <span>{formatViews(igData.postsCount || 0)} posts</span>
                </>
              ) : (
                <>
                  <span>{formatViews(result.videoViewCount)} views</span>
                  <span className="w-1 h-1 bg-gray-300 rounded-full" />
                  <span>{formatViews(result.videoLikeCount)} likes</span>
                </>
              )}
            </div>

            {/* Row 3: Verdict + fraud + badges on own line */}
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <span className={`badge ${getScoreBadgeClass(analysis.recommendation.verdict)}`}>
                {getVerdictLabel(analysis.recommendation.verdict)}
              </span>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: getFraudColor(analysis.fraud_signals.risk_level) }}
                title={`Fraud risk: ${analysis.fraud_signals.risk_level}`}
              />
              {isTopPick && (
                <span className="badge bg-accent/10 text-accent border border-accent/20">
                  Top Pick
                </span>
              )}
              {result.searchLanguage && (
                <span className="badge bg-purple-50 text-purple-700 text-[10px]">
                  {result.searchLanguage}
                </span>
              )}
            </div>

            {/* Video title — YouTube only */}
            {!isInstagram && result.videoTitle && (
              <p className="text-sm text-gray-400 mt-1 truncate">{result.videoTitle}</p>
            )}
          </div>

          {/* PCF Score — vertical on desktop, horizontal strip on mobile */}
          <div className="flex-shrink-0 text-center w-full sm:w-auto mt-3 sm:mt-0 flex sm:block items-center justify-center gap-2 sm:gap-0 border-t sm:border-t-0 border-gray-100 pt-3 sm:pt-0">
            <div
              className="text-2xl sm:text-3xl font-extrabold"
              style={{ color: scoreColor }}
            >
              {pcf.overall}
            </div>
            <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">
              PCF Score
            </div>
          </div>
        </div>

        {/* Mini Score Bars */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-2">
          <ScoreBar label="Reach" score={pcf.reach_relevance.score} />
          <ScoreBar label="Engagement" score={pcf.engagement_quality.score} />
          <ScoreBar label="Parasocial" score={pcf.parasocial_depth.score} />
          <ScoreBar label="Brand Fit" score={pcf.brand_fit.score} />
          <ScoreBar label="Growth" score={pcf.growth_potential?.score ?? pcf.bharat_applicability?.score ?? 0} />
        </div>

        {/* One-line Summary + Expand Button */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-600 italic flex-1 mr-4">
            &ldquo;{analysis.recommendation.one_line_summary}&rdquo;
          </p>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 text-sm font-medium text-accent hover:text-accent-dark transition-colors flex items-center gap-1"
            aria-expanded={expanded}
          >
            {expanded ? 'Hide' : 'View'} Details
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded Details — CSS Grid animated expand/collapse */}
      <div className={`expand-panel ${expanded ? 'expanded' : ''}`}>
        <div className="expand-inner">
          <div className="border-t border-gray-100 bg-gray-50/50 p-5 sm:p-6 space-y-6">
            {/* PCF Breakdown */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3">PCF Score Breakdown</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Engagement Quality (25%)', data: pcf.engagement_quality },
                  { label: 'Reach Relevance (25%)', data: pcf.reach_relevance },
                  { label: 'Parasocial Depth (18%)', data: pcf.parasocial_depth },
                  { label: 'Brand Fit (12%)', data: pcf.brand_fit },
                  { label: 'Growth Potential (20%)', data: pcf.growth_potential || pcf.bharat_applicability || { score: 0, reasoning: '' } },
                ].map((dim) => (
                  <div key={dim.label} className="bg-white rounded-lg p-3 border border-gray-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-600">{dim.label}</span>
                      <span
                        className="text-sm font-bold"
                        style={{ color: getScoreColor(dim.data.score) }}
                      >
                        {dim.data.score}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{dim.data.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Sentiment */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3">Sentiment Analysis</h4>
              <SentimentChart
                positive={analysis.sentiment_breakdown.positive_percent}
                negative={analysis.sentiment_breakdown.negative_percent}
                neutral={analysis.sentiment_breakdown.neutral_percent}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {analysis.sentiment_breakdown.key_positive_themes.map((theme) => (
                  <span key={theme} className="badge badge-strong">{theme}</span>
                ))}
                {analysis.sentiment_breakdown.key_negative_themes.map((theme) => (
                  <span key={theme} className="badge badge-not-recommended">{theme}</span>
                ))}
              </div>
            </div>

            {/* Parasocial Indicators */}
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3">Parasocial Indicators</h4>
              <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      { label: 'Repeat Commenter Pattern', value: analysis.parasocial_indicators.repeat_commenter_pattern },
                      { label: 'Personal Storytelling', value: analysis.parasocial_indicators.personal_storytelling_in_comments },
                      { label: 'Creator Reply Engagement', value: analysis.parasocial_indicators.creator_reply_engagement },
                      { label: 'Purchase Intent Signals', value: analysis.parasocial_indicators.purchase_intent_signals },
                    ].map((row, i) => (
                      <tr key={row.label} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 text-gray-600">{row.label}</td>
                        <td className="px-4 py-2 text-right">
                          <span className={`badge ${
                            row.value === 'high' ? 'badge-strong' :
                            row.value === 'medium' ? 'badge-moderate' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {row.value}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {analysis.parasocial_indicators.community_language_markers?.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs text-gray-500">Community markers: </span>
                  <span className="text-xs text-gray-700">
                    {analysis.parasocial_indicators.community_language_markers.join(', ')}
                  </span>
                </div>
              )}
            </div>

            {/* Fraud Signals */}
            {analysis.fraud_signals.flags?.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-3">Fraud Signals</h4>
                <div className="bg-white rounded-lg border border-gray-100 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: getFraudColor(analysis.fraud_signals.risk_level) }}
                    />
                    <span className="text-sm font-medium capitalize">
                      {analysis.fraud_signals.risk_level} Risk
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {analysis.fraud_signals.flags.map((flag, i) => (
                      <li key={i} className="text-xs text-gray-600 flex items-start gap-2">
                        <span className="text-danger mt-0.5">&#x2022;</span>
                        {flag}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-gray-500 mt-2">{analysis.fraud_signals.explanation}</p>
                </div>
              </div>
            )}

            {/* Content Classification & Recommendation */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-lg border border-gray-100 p-4">
                <h4 className="text-sm font-bold text-gray-700 mb-2">Content Profile</h4>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Primary Niche</dt>
                    <dd className="text-gray-700 font-medium">{analysis.content_classification.primary_niche}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Style</dt>
                    <dd className="text-gray-700 font-medium capitalize">{analysis.content_classification.content_style}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Audience</dt>
                    <dd className="text-gray-700 font-medium capitalize">{analysis.content_classification.audience_geography_estimate}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Language (AI detected)</dt>
                    <dd className="text-gray-700 font-medium">{analysis.content_classification.language_mix}</dd>
                  </div>
                  {result.searchLanguage && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">Searched via</dt>
                      <dd className="text-purple-700 font-medium">{result.searchLanguage}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="bg-white rounded-lg border border-gray-100 p-4">
                <h4 className="text-sm font-bold text-gray-700 mb-2">Recommendation</h4>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Suggested Format</dt>
                    <dd className="text-gray-700 font-medium text-right max-w-[60%]">{analysis.recommendation.suggested_content_format}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Est. Cost Tier</dt>
                    <dd className="text-gray-700 font-medium">{getCostLabel(analysis.recommendation.estimated_cost_tier)}</dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Instagram Intelligence */}
            {isInstagram && igData && (
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-3">Instagram Intelligence</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Engagement Breakdown */}
                  {igData.engagementBreakdown && (
                    <div className="bg-white rounded-lg border border-gray-100 p-4">
                      <h5 className="text-xs font-semibold text-gray-600 mb-2">Engagement Breakdown</h5>
                      <dl className="space-y-1.5 text-xs">
                        {igData.engagementBreakdown.likeRate && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Like Rate</dt>
                            <dd className="text-gray-700 font-medium">{igData.engagementBreakdown.likeRate}</dd>
                          </div>
                        )}
                        {igData.engagementBreakdown.commentRate && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Comment Rate</dt>
                            <dd className="text-gray-700 font-medium">{igData.engagementBreakdown.commentRate}</dd>
                          </div>
                        )}
                        {igData.engagementBreakdown.consistency && igData.engagementBreakdown.consistency !== 'unknown (single post)' && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Consistency</dt>
                            <dd className={`font-medium ${
                              igData.engagementBreakdown.consistency === 'very_consistent' ? 'text-green-600' :
                              igData.engagementBreakdown.consistency === 'consistent' ? 'text-blue-600' :
                              igData.engagementBreakdown.consistency === 'variable' ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {igData.engagementBreakdown.consistency === 'very_consistent' ? 'Very Consistent' :
                               igData.engagementBreakdown.consistency === 'consistent' ? 'Consistent' :
                               igData.engagementBreakdown.consistency === 'variable' ? 'Variable' : 'Erratic'}
                            </dd>
                          </div>
                        )}
                        {igData.engagementBreakdown.coefficientOfVariation != null && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">CV (Spread)</dt>
                            <dd className="text-gray-700 font-medium">{(igData.engagementBreakdown.coefficientOfVariation * 100).toFixed(0)}%</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Comment Quality */}
                  {igData.commentQuality && igData.commentQuality.qualityTier !== 'no_data' && (
                    <div className="bg-white rounded-lg border border-gray-100 p-4">
                      <h5 className="text-xs font-semibold text-gray-600 mb-2">Comment Quality</h5>
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Quality Tier</dt>
                          <dd className={`font-medium ${
                            igData.commentQuality.qualityTier === 'high' ? 'text-green-600' :
                            igData.commentQuality.qualityTier === 'medium' ? 'text-blue-600' :
                            igData.commentQuality.qualityTier === 'low' ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {igData.commentQuality.qualityTier === 'high' ? 'High Quality' :
                             igData.commentQuality.qualityTier === 'medium' ? 'Average' :
                             igData.commentQuality.qualityTier === 'low' ? 'Low Quality' : 'Junk'}
                          </dd>
                        </div>
                        {igData.commentQuality.avgLength != null && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Avg Length</dt>
                            <dd className="text-gray-700 font-medium">{Math.round(igData.commentQuality.avgLength)} chars</dd>
                          </div>
                        )}
                        {igData.commentQuality.substantivePercent != null && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Substantive</dt>
                            <dd className="text-gray-700 font-medium">{igData.commentQuality.substantivePercent}%</dd>
                          </div>
                        )}
                        {igData.commentQuality.emojiOnlyPercent != null && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Emoji-only</dt>
                            <dd className="text-gray-700 font-medium">{igData.commentQuality.emojiOnlyPercent}%</dd>
                          </div>
                        )}
                        {igData.commentQuality.personalStoryCount > 0 && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Personal Stories</dt>
                            <dd className="text-green-600 font-medium">{igData.commentQuality.personalStoryCount} found</dd>
                          </div>
                        )}
                        {igData.commentQuality.purchaseIntentCount > 0 && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Purchase Intent</dt>
                            <dd className="text-green-600 font-medium">{igData.commentQuality.purchaseIntentCount} signals</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Business Profile */}
                  {(igData.isBusinessAccount || igData.businessCategory || igData.externalUrl) && (
                    <div className="bg-white rounded-lg border border-gray-100 p-4">
                      <h5 className="text-xs font-semibold text-gray-600 mb-2">Business Profile</h5>
                      <dl className="space-y-1.5 text-xs">
                        {igData.isBusinessAccount != null && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Business Account</dt>
                            <dd className={`font-medium ${igData.isBusinessAccount ? 'text-green-600' : 'text-gray-500'}`}>
                              {igData.isBusinessAccount ? 'Yes' : 'No'}
                            </dd>
                          </div>
                        )}
                        {igData.businessCategory && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Category</dt>
                            <dd className="text-gray-700 font-medium">{igData.businessCategory}</dd>
                          </div>
                        )}
                        {igData.externalUrl && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Website</dt>
                            <dd className="text-accent font-medium truncate max-w-[60%]">
                              <a href={igData.externalUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {igData.externalUrl.replace(/^https?:\/\//, '').slice(0, 30)}
                              </a>
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}

                  {/* Content Signals */}
                  {(igData.followRatio != null || igData.sponsoredPostCount > 0 || igData.taggedBrands?.length > 0 || igData.locations?.length > 0 || igData.postAgeDays != null) && (
                    <div className="bg-white rounded-lg border border-gray-100 p-4">
                      <h5 className="text-xs font-semibold text-gray-600 mb-2">Content Signals</h5>
                      <dl className="space-y-1.5 text-xs">
                        {igData.followRatio != null && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Follow Ratio</dt>
                            <dd className={`font-medium ${
                              igData.followRatio > 1.5 ? 'text-amber-600' :
                              igData.followRatio < 0.1 ? 'text-green-600' : 'text-gray-700'
                            }`}>
                              {typeof igData.followRatio === 'number' ? igData.followRatio.toFixed(2) : igData.followRatio}
                            </dd>
                          </div>
                        )}
                        {igData.postAgeDays != null && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Post Recency</dt>
                            <dd className={`font-medium ${
                              igData.postAgeDays <= 7 ? 'text-green-600' :
                              igData.postAgeDays <= 30 ? 'text-blue-600' :
                              igData.postAgeDays <= 90 ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {igData.postAgeDays <= 1 ? 'Today' :
                               igData.postAgeDays <= 7 ? `${igData.postAgeDays}d ago` :
                               igData.postAgeDays <= 30 ? `${Math.round(igData.postAgeDays / 7)}w ago` :
                               `${Math.round(igData.postAgeDays / 30)}mo ago`}
                            </dd>
                          </div>
                        )}
                        {igData.sponsoredPostCount > 0 && (
                          <div className="flex justify-between">
                            <dt className="text-gray-500">Sponsored Posts</dt>
                            <dd className="text-gray-700 font-medium">{igData.sponsoredPostCount} detected</dd>
                          </div>
                        )}
                        {igData.taggedBrands?.length > 0 && (
                          <div>
                            <dt className="text-gray-500 mb-1">Tagged Brands</dt>
                            <dd className="flex flex-wrap gap-1 mt-1">
                              {igData.taggedBrands.slice(0, 8).map((brand, i) => (
                                <span key={i} className="badge bg-gray-100 text-gray-600 text-[10px]">{brand}</span>
                              ))}
                              {igData.taggedBrands.length > 8 && (
                                <span className="text-[10px] text-gray-400">+{igData.taggedBrands.length - 8} more</span>
                              )}
                            </dd>
                          </div>
                        )}
                        {igData.locations?.length > 0 && (
                          <div>
                            <dt className="text-gray-500 mb-1">Locations</dt>
                            <dd className="text-gray-700 font-medium text-[10px]">
                              {igData.locations.slice(0, 5).join(', ')}
                              {igData.locations.length > 5 && ` +${igData.locations.length - 5} more`}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}
                </div>

                {/* View Post on Instagram */}
                {igData.postUrl && (
                  <div className="mt-3">
                    <a
                      href={igData.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                      </svg>
                      View Post on Instagram
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Top Comments — sanitized to prevent XSS */}
            {result.comments?.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-3">Sample Comments</h4>
                <div className="space-y-2">
                  {result.comments.slice(0, 5).map((comment, i) => (
                    <div key={i} className="bg-white rounded-lg border border-gray-100 p-3">
                      <p className="text-xs text-gray-600 line-clamp-3">
                        {sanitizeComment(comment)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
