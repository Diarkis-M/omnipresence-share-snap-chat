import { NextResponse } from 'next/server';
import { searchInstagram } from '@/lib/instagram';

export async function POST(request) {
  try {
    const body = await request.json();
    const { category, subscriberRange, maxResults, userLearnings, gateConfig } = body;

    if (!category) {
      return NextResponse.json({ error: 'Product category is required' }, { status: 400 });
    }

    const apiToken = process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY;
    if (!apiToken) {
      return NextResponse.json(
        { error: 'Apify API token not configured. Set APIFY_API_TOKEN in .env.local' },
        { status: 500 }
      );
    }

    const { results, platformBreakdown, _meta } = await searchInstagram({
      category,
      subscriberRange: subscriberRange || 'micro',
      maxResults: maxResults || 5,
      userLearnings: Array.isArray(userLearnings) ? userLearnings : [],
      gateConfig: gateConfig && typeof gateConfig === 'object' ? gateConfig : null,
      apiToken,
    });

    return NextResponse.json({
      results,
      count: results.length,
      languageBreakdown: platformBreakdown,
      _meta: _meta || null,
    });
  } catch (error) {
    console.error('Instagram search error:', error);
    return NextResponse.json(
      { error: `Instagram search failed: ${error.message}` },
      { status: 500 }
    );
  }
}
