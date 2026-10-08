import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { requireSessionUser } from '@/lib/auth/rbac';
import { retrieveKnowledgeContext } from '@/lib/knowledge/index-file';

const schema = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(12).optional(),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  try {
    const parse = schema.safeParse(await req.json());
    if (!parse.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parse.error.flatten().fieldErrors }, { status: 400 })
      );
    }
    const result = await retrieveKnowledgeContext(auth!.user!.id, parse.data.query, parse.data.topK || 6);
    return applyCorsHeaders(NextResponse.json(result));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Search failed', message: (err as Error).message }, { status: 500 })
    );
  }
}
