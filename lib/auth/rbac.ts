import { NextRequest, NextResponse } from 'next/server';
import { User } from '../types';
import { applyCorsHeaders } from './cors';

export type PlatformRole = 'admin' | 'user';

interface SessionAuth {
  isAdmin?: boolean;
  user?: User | null;
}

function withCors(response: NextResponse, req?: NextRequest): NextResponse {
  return applyCorsHeaders(response, req);
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

export function hasAdminPrivileges(auth?: SessionAuth | null): boolean {
  if (!auth?.user || !isUserActive(auth.user)) {
    return false;
  }
  return Boolean(auth.isAdmin) && isAdminUser(auth.user);
}

export function unauthorizedResponse(message = 'Authentication required'): NextResponse {
  return withCors(NextResponse.json({ error: 'Unauthorized', message }, { status: 401 }));
}

export function forbiddenResponse(message = 'Admin access required'): NextResponse {
  return withCors(NextResponse.json({ error: 'Forbidden', message }, { status: 403 }));
}

export function requireAdmin(auth?: SessionAuth | null): NextResponse | null {
  if (!auth) return unauthorizedResponse();
  if (!auth.user) {
    return unauthorizedResponse('A signed-in admin session is required');
  }
  if (!isUserActive(auth.user)) {
    return forbiddenResponse('Account is disabled');
  }
  if (!hasAdminPrivileges(auth)) {
    return forbiddenResponse('Admin access required');
  }
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

export function conversationOwnerId(metadata?: Record<string, unknown>): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const owner = metadata.owner_id;
  return typeof owner === 'string' && owner.length > 0 ? owner : undefined;
}

export function canAccessConversation(
  auth: { isAdmin?: boolean; user?: User | null; project?: { id: string } },
  conversation: { project_id: string; metadata?: Record<string, unknown> }
): boolean {
  if (hasAdminPrivileges(auth)) return true;
  const ownerId = conversationOwnerId(conversation.metadata);
  if (auth.user?.id) return ownerId === auth.user.id;
  return Boolean(auth.project?.id) && conversation.project_id === auth.project!.id && !ownerId;
}

export function canExecuteAgent(
  auth: { isAdmin?: boolean; user?: User | null; project?: { id: string } },
  agent: { is_published: boolean; project_id?: string }
): boolean {
  if (hasAdminPrivileges(auth)) return true;
  return agent.is_published;
}
