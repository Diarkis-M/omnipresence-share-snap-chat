import { NextResponse } from 'next/server';
import { searchYouTube } from '@/lib/youtube';
import { getCacheKey, getFromCache, setInCache } from '@/lib/searchCache';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      category, contentTypes, subscriberRange, videoFormat, languages, maxResults,
      userLearnings, gateConfig,
    } = body;

    if (!category) {
      return NextResponse.json({ error: 'Product category is required' }, { status: 400 });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'YouTube API key not configured' }, { status: 500 });
    }

    // ── Check cache first — avoids burning YouTube API quota ──
    const cacheKey = getCacheKey(body);
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] Returning cached results for: ${category}`);
      return NextResponse.json({
        ...cached,
        _cached: true,
        _cacheAge: Math.round((Date.now() - cached._cachedAt) / 1000),
      });
    }

    const { results, languageBreakdown, _gateStats } = await searchYouTube({
      category,
      contentTypes,
      subscriberRange: subscriberRange || 'micro',
      videoFormat: videoFormat || 'mixed',
      languages,
      maxResults: maxResults || 20,
      userLearnings: Array.isArray(userLearnings) ? userLearnings : [],
      gateConfig: gateConfig && typeof gateConfig === 'object' ? gateConfig : null,
      apiKey,
    });

    // ── Store in cache ──
    const responseData = { results, count: results.length, languageBreakdown, _gateStats, _cachedAt: Date.now() };
    setInCache(cacheKey, responseData);

    return NextResponse.json({ results, count: results.length, languageBreakdown, _gateStats });
  } catch (error) {
    if (error.message === 'QUOTA_EXCEEDED') {
      return NextResponse.json(
        {
          error: 'YouTube API quota exceeded for today. The daily limit resets at midnight Pacific Time. Try again tomorrow, or use a different API key.',
          errorCode: 'QUOTA_EXCEEDED',
        },
        { status: 429 }
      );
    }

    // ── Rate limit (too many requests per second) ──
    if (error.message === 'RATE_LIMITED' || error.status === 429) {
      return NextResponse.json(
        {
          error: 'Too many requests to YouTube API. Please wait a moment and try again.',
          errorCode: 'RATE_LIMITED',
          retryAfter: 10,
        },
        { status: 429 }
      );
    }

    console.error('YouTube search error:', error);
    return NextResponse.json({ error: `Search failed: ${error.message}` }, { status: 500 });
  }
}
