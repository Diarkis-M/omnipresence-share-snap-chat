import { NextResponse } from 'next/server';
import { analyzeInfluencer } from '@/lib/anthropic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { influencer, brandContext, dimensionWeights } = body;

    if (!influencer) {
      return NextResponse.json({ error: 'Influencer data is required' }, { status: 400 });
    }

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Claude API key not configured. Set CLAUDE_API_KEY in .env.local' }, { status: 500 });
    }

    const analysis = await analyzeInfluencer(influencer, brandContext, apiKey, dimensionWeights);

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: `Analysis failed: ${error.message}` }, { status: 500 });
  }
}
