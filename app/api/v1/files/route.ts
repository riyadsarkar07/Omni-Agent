import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { requireSessionUser } from '@/lib/auth/rbac';
import { deleteOwnedFile, toStoragePath, writeOwnedFile } from '@/lib/storage/user-files';
import { isExtractableMime } from '@/lib/knowledge/extract';
import { getEmbeddingSupport } from '@/lib/knowledge/embed';
import { indexOwnedFile } from '@/lib/knowledge/index-file';
import crypto from 'crypto';

const ALLOWED_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
]);
const MAX_BYTES = 10 * 1024 * 1024;

function publicFile(file: {
  id: string;
  user_id: string;
  conversation_id?: string | null;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  indexed?: boolean;
  chunk_count?: number;
}) {
  return {
    id: file.id,
    user_id: file.user_id,
    conversation_id: file.conversation_id || null,
    original_name: file.original_name,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
    created_at: file.created_at,
    indexed: Boolean(file.indexed),
    chunk_count: file.chunk_count || 0,
  };
}

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  const [files, documents, embedding] = await Promise.all([
    DatabaseStore.listUserFiles(auth!.user!.id),
    DatabaseStore.listKnowledgeDocuments(auth!.user!.id),
    getEmbeddingSupport(),
  ]);
  const docsByFile = new Map(documents.map((d) => [d.file_id, d]));
  const ragEnabled = documents.some((d) => d.status === 'ready');
  return applyCorsHeaders(
    NextResponse.json({
      files: files.map((file) => {
        const doc = docsByFile.get(file.id);
        return publicFile({
          ...file,
          indexed: doc?.status === 'ready',
          chunk_count: doc?.chunk_count,
        });
      }),
      documents,
      analysisEnabled: ragEnabled,
      ragEnabled,
      embeddingsSupported: embedding.supported,
      message: embedding.supported
        ? 'Private files are stored in owner-scoped storage. Indexed documents can be used in chat.'
        : `Private files are stored in owner-scoped storage. ${embedding.reason || 'Embeddings are not configured; keyword retrieval is used when possible.'}`,
    })
  );
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;

  try {
    const form = await req.formData();
    const uploaded = form.get('file');
    if (!(uploaded instanceof File)) {
      return applyCorsHeaders(NextResponse.json({ error: 'A file is required' }, { status: 400 }));
    }
    if (uploaded.size > MAX_BYTES) {
      return applyCorsHeaders(NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 }));
    }
    const mime = uploaded.type || 'application/octet-stream';
    if (!ALLOWED_TYPES.has(mime)) {
      return applyCorsHeaders(NextResponse.json({ error: 'Unsupported file type' }, { status: 400 }));
    }

    const userId = auth!.user!.id;
    const fileId = crypto.randomUUID();
    const bytes = Buffer.from(await uploaded.arrayBuffer());
    const storagePath = toStoragePath(userId, fileId, uploaded.name);
    await writeOwnedFile(userId, fileId, bytes, uploaded.name);

    try {
      const file = await DatabaseStore.createUserFile({
        id: fileId,
        user_id: userId,
        conversation_id: null,
        original_name: uploaded.name.slice(0, 255),
        mime_type: mime,
        size_bytes: bytes.length,
        storage_path: storagePath,
      });
      let indexed = false;
      let chunkCount = 0;
      let message = 'File stored privately.';
      if (isExtractableMime(mime)) {
        const result = await indexOwnedFile(userId, file.id);
        indexed = result.indexed;
        chunkCount = result.chunkCount;
        if (result.indexed && result.embeddingsUsed) {
          message = 'File stored privately and indexed for RAG.';
        } else if (result.indexed) {
          message = result.reason
            ? `File stored and indexed for keyword retrieval. ${result.reason}`
            : 'File stored and indexed for keyword retrieval.';
        } else if (result.reason) {
          message = `File stored privately. Indexing skipped: ${result.reason}`;
        }
      }
      return applyCorsHeaders(
        NextResponse.json(
          {
            file: publicFile({ ...file, indexed, chunk_count: chunkCount }),
            analysisEnabled: indexed,
            ragEnabled: indexed,
            message,
          },
          { status: 201 }
        )
      );
    } catch (err: unknown) {
      await deleteOwnedFile(storagePath, userId);
      throw err;
    }
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to upload file', message: (err as Error).message }, { status: 500 })
    );
  }
}
