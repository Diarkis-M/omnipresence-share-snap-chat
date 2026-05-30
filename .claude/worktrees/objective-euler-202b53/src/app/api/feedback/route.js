import { NextResponse } from 'next/server';

/**
 * POST /api/feedback
 *
 * Body: {
 *   channelId, channelName, channelDescription, platform, searchLanguage,
 *   subscriberCount, comments (first few), searchCategory (what was asked)
 * }
 *
 * Uses Claude Haiku to trace WHY this creator shouldn't have surfaced for
 * that category. Returns a compact learning record the client can persist
 * to localStorage and ship back to /api/youtube/search on the next run.
 */
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      channelId,
      channelName = '',
      channelDescription = '',
      platform = 'youtube',
      searchLanguage = '',
      subscriberCount = 0,
      comments = [],
      searchCategory = '',
    } = body;

    if (!channelId || !channelName) {
      return NextResponse.json(
        { error: 'channelId and channelName are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Claude API key not configured on the server' },
        { status: 500 }
      );
    }

    const commentSample = Array.isArray(comments)
      ? comments.slice(0, 12).map((c) => (typeof c === 'string' ? c.slice(0, 200) : '')).filter(Boolean)
      : [];

    const userPrompt = [
      'You are a creator-discovery QA analyst. A marketing user just flagged this creator as "Not relevant" for their search.',
      '',
      `The user was searching for creators in the category: ${searchCategory || 'men\u2019s grooming'}`,
      `Target platform: ${platform}`,
      `Target language / tag applied: ${searchLanguage || 'unknown'}`,
      '',
      'CREATOR PROFILE',
      `Name: ${channelName}`,
      `Platform: ${platform}`,
      `Subscribers/Followers: ${subscriberCount}`,
      `Description: ${String(channelDescription).slice(0, 600)}`,
      '',
      commentSample.length > 0
        ? `Sample of recent comments on this creator:\n${commentSample.map((c, i) => `${i + 1}. ${c}`).join('\n')}`
        : 'No comment sample available.',
      '',
      'YOUR TASK',
      'Identify the ONE PRIMARY reason this creator shouldn\u2019t have surfaced for the user\u2019s search. Pick exactly one:',
      '- TOPIC_MISMATCH        — content is about a different subject (motivational, tech, cricket, spiritual, etc.)',
      '- LANGUAGE_MISMATCH     — content/audience language is wrong for the requested language tag',
      '- GEOGRAPHY_MISMATCH    — audience is non-Indian / wrong market (Western, Middle East only, etc.)',
      '- AUDIENCE_MISMATCH     — audience is wrong gender / age / intent (women-first, kids, teens, etc.)',
      '- QUALITY_PROBLEM       — channel is dead, bot-heavy, fraudulent, or spam',
      '- BRAND_UNSAFE          — content is NSFW, political, divisive, or otherwise risky for GCPL',
      '',
      'Then extract 3 to 6 short lowercase keywords (1-3 words each) that, if they appear in a channel name or description, would help identify OTHER similar irrelevant channels. The keywords should be specific and discriminating (not generic like "india" or "men"). Use words that actually appear in the profile or are strongly associated with the reason.',
      '',
      'Reply with ONLY a JSON object, no markdown, no commentary:',
      '{"reason":"TOPIC_MISMATCH","detail":"one-sentence human explanation","keywords":["keyword1","keyword2","keyword3"]}',
    ].join('\n');

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[Feedback] Haiku call failed:', response.status, errText);
      // Degrade gracefully: store the channelId with a generic reason
      return NextResponse.json({
        channelId,
        channelName,
        reason: 'USER_FLAGGED',
        detail: 'User marked this creator as not relevant.',
        keywords: [],
        _llmFailed: true,
      });
    }

    const data = await response.json();
    const text = (data?.content?.[0]?.text ?? '').trim();

    // Extract the first {...} object from the response
    let parsed = null;
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (e) {
      console.error('[Feedback] JSON parse failed:', e.message, 'raw:', text);
    }

    // Safety filter: strip keywords that are essential to the grooming-search
    // domain, so a single bad classification can't kill the whole pipeline.
    // If Claude extracts "men" or "grooming" or "beard" as a blocklist keyword,
    // future searches would filter out EVERY legitimate grooming creator.
    const DOMAIN_RESERVED = new Set([
      'men', 'man', 'male', 'boy', 'boys', 'gent', 'gents',
      'india', 'indian', 'desi', 'bharat', 'asian',
      'grooming', 'groom', 'groomed',
      'beard', 'beards', 'facial hair', 'moustache', 'mustache',
      'hair', 'hairstyle', 'hairstyling',
      'skin', 'skincare', 'face', 'facial',
      'style', 'fashion', 'lifestyle', 'lifestyle.',
      'review', 'reviews', 'reviewer',
      'channel', 'youtube', 'instagram', 'creator', 'influencer',
      'new', 'best', 'top', 'good', 'tips', 'how', 'tutorial',
      'video', 'videos', 'daily', 'every',
      'hindi', 'english', 'tamil', 'telugu', 'kannada', 'bengali', 'marathi',
      'gujarati', 'malayalam', 'punjabi', 'odia', 'hinglish',
      'perfume', 'perfumes', 'fragrance', 'cologne', 'deodorant',
    ]);
    const rawKeywords = Array.isArray(parsed?.keywords) ? parsed.keywords : [];
    const cleanKeywords = [];
    const strippedKeywords = [];
    for (const raw of rawKeywords) {
      if (typeof raw !== 'string') continue;
      const k = raw.trim().toLowerCase();
      if (k.length < 3 || k.length > 40) continue;
      // Reject single-word reserved terms and multi-word terms where every
      // word is reserved
      const words = k.split(/\s+/);
      if (words.every((w) => DOMAIN_RESERVED.has(w))) {
        strippedKeywords.push(k);
        continue;
      }
      cleanKeywords.push(k);
    }

    const learning = {
      channelId,
      channelName,
      platform,
      reason: parsed?.reason || 'USER_FLAGGED',
      detail: parsed?.detail || 'User marked this creator as not relevant.',
      keywords: cleanKeywords.slice(0, 6),
      strippedKeywords: strippedKeywords.length > 0 ? strippedKeywords : undefined,
      timestamp: Date.now(),
    };

    return NextResponse.json(learning);
  } catch (error) {
    console.error('[Feedback] Error:', error);
    return NextResponse.json(
      { error: `Feedback processing failed: ${error.message}` },
      { status: 500 }
    );
  }
}
