import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { hasAdminPrivileges } from '@/lib/auth/rbac';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const agentId = req.nextUrl.searchParams.get('agentId') || undefined;
  const isAdmin = hasAdminPrivileges(auth);
  const conversations = isAdmin
    ? await DatabaseStore.listConversations(auth.project.id, agentId)
    : await DatabaseStore.listUserConversations(auth.user?.id || '', auth.project.id);

  const scoped = agentId && !isAdmin
    ? conversations.filter((c) => c.agent_id === agentId)
    : conversations;

  return applyCorsHeaders(
    NextResponse.json({
      conversations: scoped,
      total: scoped.length,
      projectId: auth.project.id,
    })
  );
}
