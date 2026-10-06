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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const { id } = await params;
  const data = await DatabaseStore.getConversation(id);

  if (!data || (data.conversation.project_id !== auth.project.id && !auth.isAdmin)) {
    return applyCorsHeaders(NextResponse.json({ error: 'Conversation not found' }, { status: 404 }));
  }

  try {
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return applyCorsHeaders(NextResponse.json({ error: 'Title is required' }, { status: 400 }));
    }
    const conversation = await DatabaseStore.updateConversation(id, { title });
    return applyCorsHeaders(NextResponse.json({ conversation }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to update conversation', message: (err as Error).message }, { status: 500 })
    );
  }
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
