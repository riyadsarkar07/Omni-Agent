import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const { id } = await params;
  const data = await DatabaseStore.getConversation(id);

  if (!data || (data.conversation.project_id !== auth.project.id && !auth.isAdmin)) {
    return applyCorsHeaders(NextResponse.json({ error: 'Conversation not found' }, { status: 404 }));
  }

  return applyCorsHeaders(
    NextResponse.json({
      conversation: data.conversation,
      messages: data.messages,
    })
  );
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const { id } = await params;
  const data = await DatabaseStore.getConversation(id);

  if (!data || (data.conversation.project_id !== auth.project.id && !auth.isAdmin)) {
    return applyCorsHeaders(NextResponse.json({ error: 'Conversation not found' }, { status: 404 }));
  }

  await DatabaseStore.deleteConversation(id);

  return applyCorsHeaders(NextResponse.json({ success: true, deletedConversationId: id }));
}
