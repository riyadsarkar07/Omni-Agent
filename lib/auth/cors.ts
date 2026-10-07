import { NextRequest, NextResponse } from 'next/server';
import { getAppUrl, isProduction } from '../config';

function extraAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin: string): boolean {
  const allowed = new Set<string>([getAppUrl(), ...extraAllowedOrigins()]);
  if (allowed.has(origin)) return true;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (hostname.endsWith('.monkeycode-ai.live')) return true;
    if (!isProduction() && (hostname.endsWith('.vercel.app') || hostname.endsWith('.local'))) return true;
    return false;
  } catch {
    return false;
  }
}

export function allowedCorsOrigin(origin: string | null | undefined): string | null {
  if (!origin || !isAllowedOrigin(origin)) return null;
  return origin;
}

export function applyCorsHeaders(response: NextResponse, req?: NextRequest): NextResponse {
  const origin = allowedCorsOrigin(req?.headers.get('origin'));
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-api-key'
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export function corsOptionsResponse(req?: NextRequest): NextResponse {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }), req);
}
