export function formatSubscribers(count) {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`;
  return count.toString();
}

export function formatViews(count) {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return count.toString();
}

export function getScoreColor(score) {
  if (score >= 80) return '#5BC8FF';
  if (score >= 60) return '#2B95DA';
  if (score >= 40) return '#989898';
  return '#e17055';
}

export function getScoreLabel(score) {
  if (score >= 80) return 'Strong Fit';
  if (score >= 60) return 'Moderate Fit';
  if (score >= 40) return 'Weak Fit';
  return 'Not Recommended';
}

export function getScoreBadgeClass(verdict) {
  const classes = {
    strong_fit: 'badge-strong',
    moderate_fit: 'badge-moderate',
    weak_fit: 'badge-weak',
    not_recommended: 'badge-not-recommended',
    poor_fit: 'badge-not-recommended',
    avoid: 'badge-not-recommended',
  };
  return classes[verdict] || 'badge-weak';
}

export function getVerdictLabel(verdict) {
  const labels = {
    strong_fit: 'Strong Fit',
    moderate_fit: 'Moderate Fit',
    weak_fit: 'Weak Fit',
    not_recommended: 'Not Recommended',
    poor_fit: 'Poor Fit',
    avoid: 'Avoid',
  };
  return labels[verdict] || verdict.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function getFraudColor(riskLevel) {
  const colors = { low: '#5BC8FF', medium: '#989898', high: '#e17055' };
  return colors[riskLevel] || '#989898';
}

export function getCostLabel(tier) {
  const labels = {
    barter: 'Barter',
    under_5k: 'Under ₹5K',
    '5k_to_20k': '₹5K – ₹20K',
    '20k_to_50k': '₹20K – ₹50K',
    above_50k: 'Above ₹50K',
  };
  return labels[tier] || tier;
}

export function exportToCSV(results) {
  const headers = [
    'Rank', 'Channel Name', 'Platform', 'Subscribers', 'Video Title', 'Views', 'Likes',
    'PCF Score', 'Reach Relevance', 'Engagement Quality', 'Parasocial Depth',
    'Brand Fit', 'Growth Potential', 'Verdict', 'Fraud Risk',
    'Positive Sentiment %', 'Negative Sentiment %', 'Neutral Sentiment %',
    'Primary Niche', 'Content Style', 'Audience Geography', 'Language Mix',
    'Estimated Cost Tier', 'Summary', 'Search Language', 'Profile URL',
  ];

  const rows = results.map((r, i) => {
    const a = r.analysis;
    const isIG = r.platform === 'instagram';
    const profileUrl = isIG
      ? `https://instagram.com/${r._instagramData?.username || r.channelName}`
      : `https://youtube.com/channel/${r.channelId}`;
    return [
      i + 1,
      `"${r.channelName.replace(/"/g, '""')}"`,
      isIG ? 'Instagram' : 'YouTube',
      r.subscriberCount,
      `"${r.videoTitle.replace(/"/g, '""')}"`,
      r.videoViewCount,
      r.videoLikeCount,
      a.pcf_score.overall,
      a.pcf_score.reach_relevance.score,
      a.pcf_score.engagement_quality.score,
      a.pcf_score.parasocial_depth.score,
      a.pcf_score.brand_fit.score,
      (a.pcf_score.growth_potential?.score ?? a.pcf_score.bharat_applicability?.score ?? 0),
      a.recommendation.verdict,
      a.fraud_signals.risk_level,
      a.sentiment_breakdown.positive_percent,
      a.sentiment_breakdown.negative_percent,
      a.sentiment_breakdown.neutral_percent,
      `"${a.content_classification.primary_niche}"`,
      a.content_classification.content_style,
      a.content_classification.audience_geography_estimate,
      `"${a.content_classification.language_mix}"`,
      a.recommendation.estimated_cost_tier,
      `"${a.recommendation.one_line_summary.replace(/"/g, '""')}"`,
      r.searchLanguage || '',
      profileUrl,
    ];
  });

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  return csv;
}
