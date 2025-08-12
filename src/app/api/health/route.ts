import { NextResponse } from 'next/server';

export async function GET() {
  const hasOpenRouterKey = !!process.env.OPENROUTER_API_KEY;
  const siteUrl = process.env.SITE_URL || 'not set';
  const nodeEnv = process.env.NODE_ENV || 'not set';
  const keyLength = process.env.OPENROUTER_API_KEY?.length || 0;
  
  // Only show first 8 and last 4 chars of key for security
  const maskedKey = process.env.OPENROUTER_API_KEY 
    ? `${process.env.OPENROUTER_API_KEY.slice(0, 8)}...${process.env.OPENROUTER_API_KEY.slice(-4)}`
    : 'not set';

  return NextResponse.json({
    status: 'ok',
    environment: {
      NODE_ENV: nodeEnv,
      SITE_URL: siteUrl,
      OPENROUTER_API_KEY: hasOpenRouterKey ? `configured (${keyLength} chars, ${maskedKey})` : 'NOT SET',
      timestamp: new Date().toISOString(),
    }
  });
}