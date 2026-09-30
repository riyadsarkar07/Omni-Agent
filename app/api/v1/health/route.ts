import { NextResponse } from 'next/server';
import { applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { getAppUrl, getGeminiModel, isProduction } from '@/lib/config';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  const isGeminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const isSupabaseConfigured = DatabaseStore.isSupabaseConfigured();
  const productionMissing: string[] = [];
  if (isProduction()) {
    if (!process.env.GEMINI_API_KEY) productionMissing.push('GEMINI_API_KEY');
    if (!process.env.GEMINI_MODEL) productionMissing.push('GEMINI_MODEL');
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) productionMissing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) productionMissing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!process.env.ADMIN_EMAIL) productionMissing.push('ADMIN_EMAIL');
    if (!process.env.ADMIN_PASSWORD) productionMissing.push('ADMIN_PASSWORD');
    if (!process.env.ADMIN_SECRET) productionMissing.push('ADMIN_SECRET');
    if (!process.env.API_KEY_HASH_SECRET) productionMissing.push('API_KEY_HASH_SECRET');
    if (!process.env.APP_URL) productionMissing.push('APP_URL');
  }

  const healthData = {
    status: productionMissing.length > 0 ? 'degraded' : 'healthy',
    service: 'OmniAgent AI Platform',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime ? Math.floor(process.uptime()) : 0,
    app_url: getAppUrl(),
    gemini_engine: {
      status: isGeminiConfigured ? 'ready' : 'unconfigured',
      default_model: getGeminiModel() || 'unconfigured',
      models_supported: [
        'gemini-3.5-flash',
        'gemini-3.1-pro-preview',
        'gemini-3.1-flash-lite',
        'gemini-3.8-flash',
      ],
      thinking_mode_supported: true,
      streaming_supported: true,
    },
    database: {
      adapter: isSupabaseConfigured ? 'supabase-postgresql' : 'in-memory-preview-resilient',
      status: isSupabaseConfigured ? 'connected' : isProduction() ? 'unconfigured' : 'connected',
    },
    documentation: '/#documentation',
    missing_production_secrets: productionMissing,
  };

  return applyCorsHeaders(NextResponse.json(healthData, { status: 200 }));
}
