import { NextRequest, NextResponse } from 'next/server';
import { applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { getAppUrl, getGeminiModel, isProduction } from '@/lib/config';

export async function OPTIONS(req: NextRequest) {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }), req);
}

export async function GET(req: NextRequest) {
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

  let databaseReachable = isSupabaseConfigured;
  if (isSupabaseConfigured) {
    try {
      const projects = await DatabaseStore.listProjects();
      databaseReachable = Array.isArray(projects);
    } catch {
      databaseReachable = false;
    }
  }

  let providerConnectivity: { configured: number; enabled: number; connected: number } = {
    configured: 0,
    enabled: 0,
    connected: 0,
  };
  try {
    const providers = await DatabaseStore.listProviders();
    providerConnectivity = {
      configured: providers.length,
      enabled: providers.filter((p) => p.enabled).length,
      connected: providers.filter((p) => p.connectionStatus === 'Connected').length,
    };
  } catch {
    // Health must still return configuration status.
  }

  const healthData = {
    status: productionMissing.length > 0 || (isProduction() && !databaseReachable) ? 'degraded' : 'healthy',
    service: 'OmniAgent AI Platform',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime ? Math.floor(process.uptime()) : 0,
    app_url: getAppUrl(),
    gemini_engine: {
      configured: isGeminiConfigured,
      status: isGeminiConfigured ? 'configured' : 'unconfigured',
      connectivity: isGeminiConfigured ? 'not-probed' : 'unconfigured',
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
      configured: isSupabaseConfigured,
      status: isSupabaseConfigured
        ? databaseReachable
          ? 'connected'
          : 'unreachable'
        : isProduction()
          ? 'unconfigured'
          : 'in-memory',
    },
    providers: {
      ...providerConnectivity,
      note: 'connected counts only providers whose last test reported Connected; configuration is not a live probe',
    },
    documentation: '/#documentation',
    missing_production_secrets: productionMissing,
  };

  return applyCorsHeaders(NextResponse.json(healthData, { status: 200 }), req);
}
