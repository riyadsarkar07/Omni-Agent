import { NextResponse } from 'next/server';
import { applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  const isGeminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const isSupabaseConfigured = DatabaseStore.isSupabaseConfigured();

  const healthData = {
    status: 'healthy',
    service: 'OmniAgent AI Platform',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime ? Math.floor(process.uptime()) : 0,
    gemini_engine: {
      status: isGeminiConfigured ? 'ready' : 'unconfigured',
      default_model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
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
      status: 'connected',
    },
    documentation: '/#documentation',
  };

  return applyCorsHeaders(NextResponse.json(healthData, { status: 200 }));
}
