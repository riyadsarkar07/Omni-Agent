import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const agentId = req.nextUrl.searchParams.get('agentId') || undefined;
  const conversations = await DatabaseStore.listConversations(auth.project.id, agentId);

  return applyCorsHeaders(
    NextResponse.json({
      conversations,
      total: conversations.length,
      projectId: auth.project.id,
    })
  );
}
