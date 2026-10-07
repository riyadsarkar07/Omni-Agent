import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { requireSessionUser } from '@/lib/auth/rbac';

const createSchema = z.object({
  content: z.string().min(1).max(2000),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  const memories = await DatabaseStore.listUserMemories(auth!.user!.id);
  return applyCorsHeaders(NextResponse.json({ memories, total: memories.length }));
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  try {
    const parse = createSchema.safeParse(await req.json());
    if (!parse.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parse.error.flatten().fieldErrors }, { status: 400 })
      );
    }
    const memory = await DatabaseStore.createUserMemory(auth!.user!.id, parse.data.content);
    return applyCorsHeaders(NextResponse.json({ memory }, { status: 201 }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to create memory', message: (err as Error).message }, { status: 500 })
    );
  }
}

export async function DELETE(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  const deleted = await DatabaseStore.clearUserMemories(auth!.user!.id);
  return applyCorsHeaders(NextResponse.json({ success: true, deletedCount: deleted }));
}
