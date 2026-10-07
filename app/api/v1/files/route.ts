import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { requireSessionUser } from '@/lib/auth/rbac';
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
      files,
      analysisEnabled: false,
      message: 'File storage is available. AI file analysis and RAG are not enabled yet.',
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
    if (!ALLOWED_TYPES.has(uploaded.type || 'application/octet-stream')) {
      return applyCorsHeaders(NextResponse.json({ error: 'Unsupported file type' }, { status: 400 }));
    }

    const bytes = Buffer.from(await uploaded.arrayBuffer());
    const storagePath = `user-files/${auth!.user!.id}/${crypto.randomUUID()}-${uploaded.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const file = await DatabaseStore.createUserFile({
      user_id: auth!.user!.id,
      conversation_id: null,
      original_name: uploaded.name,
      mime_type: uploaded.type || 'application/octet-stream',
      size_bytes: bytes.length,
      storage_path: storagePath,
    });

    return applyCorsHeaders(
      NextResponse.json({
        file: { ...file, storage_path: storagePath },
        analysisEnabled: false,
        message: 'File metadata stored. AI analysis/RAG is not enabled.',
      }, { status: 201 })
    );
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to upload file', message: (err as Error).message }, { status: 500 })
    );
  }
}
