import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { requireSessionUser } from '@/lib/auth/rbac';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  const token = req.cookies.get('omniagent_session')?.value || req.headers.get('authorization')?.replace(/^Bearer /i, '');
  const sessions = await DatabaseStore.listUserSessions(auth!.user!.id, token);
  return applyCorsHeaders(NextResponse.json({ sessions, total: sessions.length }));
}

export async function DELETE(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  const token = req.cookies.get('omniagent_session')?.value || req.headers.get('authorization')?.replace(/^Bearer /i, '');
  const keepCurrent = req.nextUrl.searchParams.get('keepCurrent') !== 'false';
  const deleted = await DatabaseStore.revokeAllUserSessions(auth!.user!.id, keepCurrent ? token : null);
  return applyCorsHeaders(NextResponse.json({ success: true, deletedCount: deleted }));
}
