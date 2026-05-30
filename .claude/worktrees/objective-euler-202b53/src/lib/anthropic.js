import { DEFAULT_DIMENSION_WEIGHTS } from '@/config/gates';

function buildSystemPrompt(weights) {
  const w = weights || DEFAULT_DIMENSION_WEIGHTS;

  // ── Dimension definitions ──
  const DIM_DEFS = [
    {
      key: 'engagement_quality',
      label: 'Engagement Quality',
      guide: `Like-to-view ratio, comment-to-view ratio. BUT more importantly: are comments substantive or just "nice video bro"? Look for comments that reference specific product features, ask genuine questions, or share personal experiences. High weight because engagement quality is the strongest signal of real audience value.`,
    },
    {
      key: 'reach_relevance',
      label: 'Reach Relevance',
      guide: `Subscriber count relative to niche, view-to-subscriber ratio. Penalize channels with high subs but low views (dead audience). Growing channels with fewer subs but strong view ratios should score higher than stagnant large channels.`,
    },
    {
      key: 'growth_potential',
      label: 'Growth Potential',
      guide: `Is this creator on an upward trajectory? Key signals: recent upload frequency and consistency, subscriber growth trend, increasing view counts on newer videos vs older ones, content quality improvement over time, niche positioning (are they in a growing content segment?). Creators showing acceleration in uploads or views score highest. Dormant or slowing channels score low. This dimension rewards creators who are BUILDING momentum — the best time to partner is before they peak.`,
    },
    {
      key: 'parasocial_depth',
      label: 'Parasocial Depth',
      guide: `This measures the emotional bond between creator and audience. Key signals in comments: personal stories ("I tried this because you recommended..."), repeat patterns (same users commenting), creator trust ("I trust your opinion"), purchase confession ("ordered it after your video"), community language (inside jokes, nicknames for the creator). Higher weight = we care about deep audience connection.`,
    },
    {
      key: 'brand_fit',
      label: 'Brand Fit',
      guide: `How well does this creator's content, audience, and values align with the specified GCPL brand? Consider: product category match, audience demographics, content quality, brand safety.`,
    },
  ];

  const activeDims = DIM_DEFS.filter(d => (w[d.key] || 0) > 0);
  const inactiveDims = DIM_DEFS.filter(d => (w[d.key] || 0) === 0);

  // Scoring guide — only active dimensions
  const scoringLines = activeDims
    .map(d => `- ${d.label} (${w[d.key]}%): ${d.guide}`)
    .join('\n');

  // Overall formula — only active dimensions
  const formulaParts = activeDims
    .map(d => `(${d.key} × ${w[d.key] / 100})`)
    .join(' + ');

  // Inactive dimensions instruction
  const inactiveNote = inactiveDims.length > 0
    ? `\n\nDIMENSIONS EXCLUDED FROM THIS MODEL (set score to 0, reasoning to "Excluded from model — weight 0%"):\n${inactiveDims.map(d => `- ${d.label}`).join('\n')}\nDo NOT analyze or spend tokens on these dimensions. Set their scores to 0 immediately.`
    : '';

  const activeCount = activeDims.length;

  return `You are a senior influencer marketing analyst specializing in the Indian FMCG market, working for Godrej Consumer Products Limited (GCPL). You evaluate social media influencers (YouTube and Instagram) using the Parasocial Capital Framework (PCF).

Analyze the provided influencer data and return a JSON response with EXACTLY this structure (no markdown, no backticks, no extra text — just the JSON):

{
  "pcf_score": {
    "overall": 0,
    "reach_relevance": {
      "score": 0,
      "reasoning": ""
    },
    "engagement_quality": {
      "score": 0,
      "reasoning": ""
    },
    "parasocial_depth": {
      "score": 0,
      "reasoning": ""
    },
    "brand_fit": {
      "score": 0,
      "reasoning": ""
    },
    "growth_potential": {
      "score": 0,
      "reasoning": ""
    }
  },
  "sentiment_breakdown": {
    "positive_percent": 0,
    "negative_percent": 0,
    "neutral_percent": 0,
    "key_positive_themes": [],
    "key_negative_themes": []
  },
  "fraud_signals": {
    "risk_level": "low",
    "flags": [],
    "explanation": ""
  },
  "parasocial_indicators": {
    "repeat_commenter_pattern": "low",
    "personal_storytelling_in_comments": "low",
    "creator_reply_engagement": "low",
    "purchase_intent_signals": "low",
    "community_language_markers": []
  },
  "content_classification": {
    "primary_niche": "",
    "content_style": "review",
    "audience_geography_estimate": "mixed",
    "language_mix": ""
  },
  "recommendation": {
    "verdict": "moderate_fit",
    "one_line_summary": "",
    "suggested_content_format": "",
    "estimated_cost_tier": "under_5k"
  }
}

ACTIVE MODEL: ${activeCount} of 5 dimensions enabled.

SCORING GUIDE (${activeCount} active dimension${activeCount !== 1 ? 's' : ''} — MUST USE THESE EXACT WEIGHTS):
${scoringLines}

OVERALL SCORE CALCULATION:
overall = ${formulaParts}${inactiveNote}

NOTE: Geography filtering is handled separately as a binary pre-filter BEFORE this analysis. You do NOT need to score geography. Focus purely on the ${activeCount} active dimension${activeCount !== 1 ? 's' : ''} above.

FRAUD DETECTION — flag these:
- Engagement ratio anomalies (very high likes but almost no comments, or vice versa)
- Generic/bot-like comments (single emoji comments, "nice", "great video" with no substance)
- Sudden subscriber spikes inconsistent with content quality
- Comments that seem planted/paid (overly promotional language)
- Same comment templates appearing multiple times

TRANSLITERATED / ROMANIZED LANGUAGE HANDLING:
Indian YouTube comments are VERY often written in Roman script but in a regional language (called "code-mixing" or "chat language"). You MUST recognize and accurately analyze these:
- Hindi in Roman script: "bhai bahut accha hai", "ye product mast hai", "paisa wasool", "kya baat hai", "ekdum sahi"
- Telugu in Roman script: "chala bagundi", "super ga undi", "mari manchidi", "baaga chepparu"
- Tamil in Roman script: "romba nalla iruku", "semma product da", "theriyum bro", "sollunga"
- Bengali in Roman script: "darun review", "khub bhalo", "onek sundor", "fatafati product"
- Kannada in Roman script: "tumba chennagi ide", "bombat product", "sakkath olle"
- Marathi in Roman script: "khup chhan aahe", "mhanje zalay", "bhari product"
- Gujarati in Roman script: "saras chhe", "kem cho", "nathi aavtu", "aavjo"
- Malayalam in Roman script: "adipoli anu", "njan vangi", "kollam product", "alle machaan"
- Punjabi in Roman script: "tussi kharido", "oye vadiya hai", "bahut sahi wich", "paji kidda"
- Odia in Roman script: "bhala achhi", "mun kinichhi", "kemiti acha", "bahut bhala"
Treat these as genuine regional language engagement. Identify the actual language being spoken regardless of script used. Report the real language mix (e.g., "Hinglish (Roman script)", "Telugu (Roman script)", etc.) in language_mix.

CROSS-LANGUAGE AWARENESS: Indian languages share a common Indo-Aryan/Dravidian origin, so many words appear in multiple languages (e.g., "bhai" in Hindi/Bengali/Gujarati, "nahi" in Hindi/Marathi/Odia, "illa" in Tamil/Kannada). Use COPULA verbs as the strongest language signal: hai→Hindi, aahe→Marathi, ache→Bengali, chhe→Gujarati, achhi→Odia, iruku→Tamil, undi→Telugu, ide→Kannada, anu→Malayalam. When in doubt, look at the copula to determine the dominant language.

IMPORTANT: Be rigorous. Most influencers should score 40-70. Only truly exceptional fits should score above 80. Do NOT inflate scores. A score below 40 is valid and useful — it saves the brand manager time by filtering out poor fits.`;
}

export async function analyzeInfluencer(influencerData, brandContext, apiKey, dimensionWeights) {
  const {
    channelName, channelDescription, subscriberCount,
    videoTitle, videoViewCount, videoLikeCount,
    comments, searchLanguage,
    _channelProfile, _shortsData, _preScreen,
    platform, _instagramData,
  } = influencerData;

  const isInstagram = platform === 'instagram';

  const safeComments = comments || [];
  const commentsText = safeComments.length > 0
    ? safeComments.slice(0, 150).join('\n')
    : '(No comments available for this video)';

  // Build channel profile section
  const profileLines = [];
  if (_channelProfile) {
    profileLines.push(`Detected Language: ${_channelProfile.detectedLanguage} (all: ${_channelProfile.allDetectedLanguages?.join(', ') || 'unknown'})`);
    profileLines.push(`Content Format: ${_channelProfile.isShortOnly ? 'SHORTS ONLY (no long-form videos)' : _channelProfile.hasShorts ? 'Mixed (regular + Shorts)' : 'Long-form only'}`);
    if (_channelProfile.regularVideoCount !== undefined) {
      profileLines.push(`Videos found: ${_channelProfile.regularVideoCount} regular, ${_channelProfile.shortsVideoCount} Shorts`);
    }
  }

  // Build Shorts section
  let shortsSection = '';
  if (_shortsData && _shortsData.comments && _shortsData.comments.length > 0) {
    shortsSection = `

── YOUTUBE SHORTS DATA (separate analysis — Shorts have different engagement dynamics) ──
Shorts Title: ${_shortsData.title}
Shorts Views: ${_shortsData.viewCount.toLocaleString()}
Shorts Likes: ${_shortsData.likeCount.toLocaleString()}
Duration: ${_shortsData.durationSec}s
Pre-detected negative sentiment in Shorts comments: ${_shortsData.negativeSentiment}%
${_shortsData.negativeSentiment > 25 ? '⚠️ WARNING: High negative sentiment detected in Shorts comments. Examine carefully — audience may be bashing this creator.' : ''}

Shorts Comments (top ${Math.min(_shortsData.comments.length, 80)}):
${_shortsData.comments.slice(0, 80).join('\n')}`;
  }

  // Build pre-screening context
  let preScreenContext = '';
  if (_preScreen) {
    preScreenContext = `
Pre-screening scores (automated, for context):
  Title/channel relevance: ${_preScreen.titleRelevance}/100
  Regular comment quality: ${_preScreen.regularCommentScore}/100
  Shorts comment quality: ${_preScreen.shortsCommentScore}/100
  Shorts negative sentiment: ${_preScreen.shortsNegativeSentiment}%
  Product mentions in comments: ${_preScreen.regularProductMentions || 0} (regular) + ${_preScreen.shortsProductMentions || 0} (shorts)
  Comment languages detected: ${_preScreen.detectedCommentLanguages?.join(', ') || 'unknown'}`;
  }

  // Build Instagram-specific context — feed ALL available Apify data to Claude
  let instagramSection = '';
  if (isInstagram && _instagramData) {
    const ig = _instagramData;

    // Follower/following ratio — key fraud signal
    const followRatioNote = ig.followRatio
      ? `Follower/Following Ratio: ${ig.followRatio}:1${parseFloat(ig.followRatio) < 2 ? ' ⚠️ LOW — may indicate follow-for-follow growth or bought followers' : parseFloat(ig.followRatio) > 20 ? ' (strong organic signal)' : ''}`
      : '';

    // Business account intel
    const bizNote = ig.isBusinessAccount
      ? `Account Type: Business/Creator Account${ig.businessCategory ? ` — Category: "${ig.businessCategory}"` : ''}`
      : 'Account Type: Personal account';

    // Sponsored content frequency
    const sponsorNote = ig.sponsoredPostCount > 0
      ? `Sponsored/Ad Posts (last 10): ${ig.sponsoredPostCount} detected (${ig.sponsoredPostCount >= 5 ? '⚠️ heavy ad load — audience may have ad fatigue' : 'reasonable mix'})`
      : 'Sponsored/Ad Posts: None detected in recent posts';

    // Brand collaborations
    const brandsNote = ig.taggedBrands && ig.taggedBrands.length > 0
      ? `Tagged Brands/Accounts: @${ig.taggedBrands.join(', @')}`
      : 'Tagged Brands: None detected';

    // Location data for Bharat Applicability
    const locationNote = ig.locations && ig.locations.length > 0
      ? `Post Locations: ${ig.locations.join(', ')}`
      : 'Post Locations: Not tagged';

    // Post recency
    const recencyNote = ig.postAgeDays !== null
      ? `Discovered Post Age: ${ig.postAgeDays} days old${ig.postAgeDays > 180 ? ' ⚠️ OLD — creator may be inactive in this niche' : ig.postAgeDays < 30 ? ' (recent — actively posting)' : ''}`
      : '';

    // External link (website/linktree)
    const linkNote = ig.externalUrl
      ? `External Link: ${ig.externalUrl}`
      : '';

    // Top-liked comments (highest signal comments)
    const topCommentNote = ig.topLikedComments && ig.topLikedComments.length > 0
      ? `\nHighly-Liked Comments (community favorites — these carry more weight):\n${ig.topLikedComments.map((c) => `  [${c.likes} likes] ${c.text}`).join('\n')}`
      : '';

    // S2: Engagement breakdown details
    const engBreakdown = ig.engagementBreakdown || {};
    const engSection = engBreakdown.postsAnalyzed > 1
      ? `── ENGAGEMENT BREAKDOWN (S2 — account-level, ${engBreakdown.postsAnalyzed} posts analyzed) ──
Avg Total Engagement Rate: ${engBreakdown.avg}
  → Like Rate (avg): ${engBreakdown.likeRate}
  → Comment Rate (avg): ${engBreakdown.commentRate}
Engagement Consistency: ${engBreakdown.consistency} (StdDev: ${engBreakdown.stdDev})
Per-Post Rates (recent): ${(engBreakdown.perPost || []).join(', ')}
${engBreakdown.consistency === 'erratic' ? '⚠️ ERRATIC engagement — some posts go viral while others flop. May indicate algorithm-dependent reach, not loyal audience.' : engBreakdown.consistency === 'very_consistent' ? '✓ VERY CONSISTENT engagement — indicates a loyal, recurring audience base.' : ''}`
      : `Engagement Rate: ${ig.engagementRate || 'N/A'} (single post — insufficient data for consistency analysis)`;

    // S4: Comment quality metrics
    const cq = ig.commentQuality || {};
    const commentQualitySection = cq.totalComments > 0
      ? `── COMMENT QUALITY ANALYSIS (${cq.totalComments} comments analyzed) ──
Avg Comment Length: ${cq.avgLength} chars ${cq.avgLength < 10 ? '⚠️ VERY SHORT — mostly emoji/one-word' : cq.avgLength > 40 ? '✓ Substantive comments' : ''}
Emoji-Only Comments: ${cq.emojiOnlyPercent}%${cq.emojiOnlyPercent > 60 ? ' ⚠️ HIGH — weak audience engagement' : ''}
Generic Comments ("nice", "great", etc): ${cq.genericPercent}%
Substantive Comments (>20 chars, non-generic): ${cq.substantivePercent}%
Questions from Audience: ${cq.questionPercent}% ${cq.questionPercent > 15 ? '✓ Audience actively asks questions — strong engagement signal' : ''}
Personal Stories ("I tried/bought..."): ${cq.personalStoryCount} found ${cq.personalStoryCount >= 3 ? '✓ STRONG parasocial signal — audience acts on creator recommendations' : ''}
Purchase Intent Signals ("where to buy", "price"...): ${cq.purchaseIntentCount} found ${cq.purchaseIntentCount >= 2 ? '✓ COMMERCIAL INTENT — audience ready to buy' : ''}
Comment Quality Tier: ${cq.qualityTier.toUpperCase()}`
      : 'Comments: None available for quality analysis';

    instagramSection = `

── INSTAGRAM PROFILE (Apify Scraped Data) ──
Username: @${ig.username}
Total Posts: ${ig.postsCount || 'N/A'}
Following: ${ig.followingCount || 'N/A'}
${followRatioNote}
Verified: ${ig.isVerified ? 'Yes ✓' : 'No'}
${bizNote}
${sponsorNote}
${brandsNote}
${locationNote}
${recencyNote}
${linkNote}

${engSection}

${commentQualitySection}

Post Type: ${ig.postType || 'Reel/Post'}
Hashtags on Discovered Post: ${ig.hashtags?.join(', ') || 'none'}

Recent Captions (content style signals):
${(ig.recentCaptions || []).slice(0, 5).join('\n---\n')}${topCommentNote}`;
  }

  const effectiveBrandContext = brandContext || 'GCPL (Godrej Consumer Products) — grooming, personal care, and home care brands including Muuchstac';

  const userMessage = `Analyze this ${isInstagram ? 'Instagram' : 'YouTube'} influencer for brand fit with ${effectiveBrandContext}:

${isInstagram ? 'Profile' : 'Channel'}: ${channelName}
${isInstagram ? 'Bio' : 'Channel Description'}: ${channelDescription || '(not available)'}
${isInstagram ? 'Followers' : 'Subscribers'}: ${subscriberCount.toLocaleString()}
Platform: ${isInstagram ? 'Instagram (Reels/Posts)' : 'YouTube'}
${profileLines.length > 0 ? '\n── CHANNEL PROFILE ──\n' + profileLines.join('\n') : ''}${instagramSection}

── ${isInstagram ? 'DISCOVERED POST / REEL' : 'PRIMARY VIDEO (long-form)'} ──
${isInstagram ? 'Caption' : 'Video Title'}: ${videoTitle}
${isInstagram ? 'Plays/Likes' : 'Views'}: ${videoViewCount.toLocaleString()}
Likes: ${videoLikeCount.toLocaleString()}
Comment Count: ${safeComments.length}
${isInstagram ? '' : `Searched via language: ${searchLanguage || 'English'}`}

IMPORTANT: Comments may be in Roman-script regional languages (e.g., Hindi typed in English like "bhai mast hai"). Identify the ACTUAL language spoken, not just the script.

${isInstagram ? 'Post' : 'Regular Video'} Comments (top ${Math.min(safeComments.length, 150)}):
${commentsText}${shortsSection}
${preScreenContext}

CRITICAL ANALYSIS NOTES:
${isInstagram ? `- This is an INSTAGRAM creator discovered via hashtag search. Use ALL the Apify profile data provided above.
- ENGAGEMENT RATE (CRITICAL): Account-level avg engagement rate is computed across recent posts. Benchmarks: <1% = dead/bought audience, 1-3% = average, 3-5% = strong, >5% = excellent. But ALWAYS cross-check with ENGAGEMENT CONSISTENCY — a 4% avg with "erratic" consistency means viral one-offs, not loyal audience.
- ENGAGEMENT CONSISTENCY: "very_consistent" = loyal recurring audience (boost Parasocial Depth). "erratic" = algorithm-dependent reach (penalize Parasocial Depth). "variable" = mixed signals.
- COMMENT-RATE vs LIKE-RATE: A high like-rate but near-zero comment-rate = passive audience (low parasocial depth). High comment-rate relative to like-rate = actively engaged community (boost Engagement Quality AND Parasocial Depth).
- COMMENT QUALITY TIER: Use the computed metrics (emoji-only %, substantive %, question %, personal stories, purchase intent). A "high" quality tier with personal stories and purchase intent signals = strong parasocial bond. A "very_low" tier with 70%+ emoji-only comments = shallow engagement — penalize heavily.
- PURCHASE INTENT in comments: If audience asks "where to buy" or "price" — this is gold for Brand Fit. These creators drive real commercial action.
- FOLLOWER/FOLLOWING RATIO: Below 2:1 = follow-for-follow growth → flag in Fraud Signals. Above 10:1 = organic growth.
- BUSINESS ACCOUNT + CATEGORY: Check if business category matches brand niche. "Beauty"/"Personal Care" = strong fit for grooming brands.
- SPONSORED POST FREQUENCY: 5+ ads in 10 posts = ad fatigue risk → lower Parasocial Depth. 0 sponsored = opportunity for first-time collab.
- TAGGED BRANDS: Shows existing brand relationships. Competitor brands = exclusivity risk. GCPL brands = strong positive.
- POST LOCATIONS: Indian city/town names are useful context for audience geography.
- HIGHLY-LIKED COMMENTS: Analyze these FIRST — community favorites carry disproportionate weight.
- POST RECENCY: >6 months old = creator may be inactive in this niche.
- CAPTION ANALYSIS: Read captions for content style, language mix, genuine opinions vs promotional copy.` : `- If this is a Shorts-only channel, be skeptical of engagement metrics (Shorts inflate views/likes but often lack real audience connection)
- If Shorts comments show high negative sentiment, factor this HEAVILY into your scoring — the audience is actively rejecting this creator
- If detected language does NOT match the searched language, note this as a potential audience mismatch`}
- A doctor/clinic channel is NOT the same as an influencer — evaluate if this is genuine creator content vs professional marketing`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: buildSystemPrompt(dimensionWeights),
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${err.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  // Parse JSON from the response — handle markdown wrapping, mixed text, truncation
  let jsonText = text.trim();

  // Strip markdown code fences
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  // 1. Try direct parse
  try { return JSON.parse(jsonText); } catch {}

  // 2. Extract outermost { ... } block
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}

    // 3. Response may be truncated — try to repair by closing open braces/brackets
    let fragment = jsonMatch[0];
    // Remove any trailing partial string value (ends mid-sentence without closing quote)
    fragment = fragment.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
    // Count open vs close braces/brackets and append closers
    const opens = (fragment.match(/\{/g) || []).length;
    const closes = (fragment.match(/\}/g) || []).length;
    const openBrackets = (fragment.match(/\[/g) || []).length;
    const closeBrackets = (fragment.match(/\]/g) || []).length;
    // Strip trailing comma
    fragment = fragment.replace(/,\s*$/, '');
    // Close any open strings
    const quoteCount = (fragment.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) fragment += '"';
    for (let i = 0; i < openBrackets - closeBrackets; i++) fragment += ']';
    for (let i = 0; i < opens - closes; i++) fragment += '}';
    try { return JSON.parse(fragment); } catch {}
  }

  throw new Error('Failed to parse AI analysis response: ' + jsonText.slice(0, 120));
}
