import { NextResponse } from 'next/server';
import { User } from '../types';

export type PlatformRole = 'admin' | 'user';

interface SessionAuth {
  isAdmin?: boolean;
  user?: User | null;
}

function withCors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-internal-admin');
  return response;
}

export function isAdminUser(user?: Pick<User, 'role'> | null): boolean {
  return user?.role === 'admin';
}

export function toPlatformRole(role: User['role'] | string | undefined): PlatformRole {
  return role === 'admin' ? 'admin' : 'user';
}

export function isUserActive(user?: Pick<User, 'status'> | null): boolean {
  return !user?.status || user.status === 'active';
}

export function unauthorizedResponse(message = 'Authentication required'): NextResponse {
  return withCors(NextResponse.json({ error: 'Unauthorized', message }, { status: 401 }));
}

export function forbiddenResponse(message = 'Admin access required'): NextResponse {
  return withCors(NextResponse.json({ error: 'Forbidden', message }, { status: 403 }));
}

export function requireAdmin(auth?: SessionAuth | null): NextResponse | null {
  if (!auth) return unauthorizedResponse();
  if (!auth.isAdmin) return forbiddenResponse('Admin access required');
  return null;
}

export function requireSessionUser(auth?: SessionAuth | null): NextResponse | null {
  if (!auth) return unauthorizedResponse();
  if (!auth.user) {
    return unauthorizedResponse('A signed-in user session is required');
  }
  if (!isUserActive(auth.user)) {
    return forbiddenResponse('Account is disabled');
  }
  return null;
}

export function actorEmail(auth?: SessionAuth | null): string {
  return auth?.user?.email || 'system';
}
