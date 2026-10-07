import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { requireSessionUser } from '@/lib/auth/rbac';
import { deleteOwnedFile, toStoragePath, writeOwnedFile } from '@/lib/storage/user-files';
import crypto from 'crypto';

const ALLOWED_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);
const MAX_BYTES = 5 * 1024 * 1024;

function publicFile(file: { id: string; user_id: string; conversation_id?: string | null; original_name: string; mime_type: string; size_bytes: number; created_at: string }) {
  return {
    id: file.id,
    user_id: file.user_id,
    conversation_id: file.conversation_id || null,
    original_name: file.original_name,
    mime_type: file.mime_type,
    size_bytes: file.size_bytes,
    created_at: file.created_at,
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
  const files = await DatabaseStore.listUserFiles(auth!.user!.id);
  return applyCorsHeaders(
    NextResponse.json({
      files: files.map(publicFile),
      analysisEnabled: false,
      ragEnabled: false,
      message: 'Private file storage is available. Files are not sent to models, and RAG/AI analysis is not enabled.',
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
      return applyCorsHeaders(NextResponse.json({ error: 'File exceeds 5MB limit' }, { status: 400 }));
    }
    const mime = uploaded.type || 'application/octet-stream';
    if (!ALLOWED_TYPES.has(mime)) {
      return applyCorsHeaders(NextResponse.json({ error: 'Unsupported file type' }, { status: 400 }));
    }

    const userId = auth!.user!.id;
    const fileId = crypto.randomUUID();
    const bytes = Buffer.from(await uploaded.arrayBuffer());
    const storagePath = toStoragePath(userId, fileId);
    await writeOwnedFile(userId, fileId, bytes);

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
      return applyCorsHeaders(
        NextResponse.json(
          {
            file: publicFile(file),
            analysisEnabled: false,
            ragEnabled: false,
            message: 'File stored privately. AI analysis/RAG is not enabled.',
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
