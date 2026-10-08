import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { requireSessionUser } from '@/lib/auth/rbac';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  const { id } = await params;
  const token = req.cookies.get('omniagent_session')?.value || req.headers.get('authorization')?.replace(/^Bearer /i, '');
  const deleted = await DatabaseStore.revokeUserSession(auth!.user!.id, id, token);
  if (!deleted) {
    return applyCorsHeaders(NextResponse.json({ error: 'Session not found' }, { status: 404 }));
  }
  return applyCorsHeaders(NextResponse.json({ success: true, deletedSessionId: id }));
}
