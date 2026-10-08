import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { requireSessionUser } from '@/lib/auth/rbac';
import { getEmbeddingSupport } from '@/lib/knowledge/embed';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  const [documents, embedding] = await Promise.all([
    DatabaseStore.listKnowledgeDocuments(auth!.user!.id),
    getEmbeddingSupport(),
  ]);
  return applyCorsHeaders(
    NextResponse.json({
      documents,
      embeddingsSupported: embedding.supported,
      limitation: embedding.supported ? null : embedding.reason,
    })
  );
}
