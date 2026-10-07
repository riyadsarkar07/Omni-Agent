import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { requireSessionUser } from '@/lib/auth/rbac';
import { deleteOwnedFile, readOwnedFile } from '@/lib/storage/user-files';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  const { id } = await params;
  const file = await DatabaseStore.getUserFile(id, auth!.user!.id);
  if (!file || !file.storage_path) {
    return applyCorsHeaders(NextResponse.json({ error: 'File not found' }, { status: 404 }));
  }
  const bytes = await readOwnedFile(file.storage_path, auth!.user!.id);
  if (!bytes) {
    return applyCorsHeaders(NextResponse.json({ error: 'File not found' }, { status: 404 }));
  }
  const filename = file.original_name.replace(/[\r\n"]/g, '_');
  const res = new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': file.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
  return applyCorsHeaders(res);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  const { id } = await params;
  const deleted = await DatabaseStore.deleteUserFile(auth!.user!.id, id);
  if (!deleted) {
    return applyCorsHeaders(NextResponse.json({ error: 'File not found' }, { status: 404 }));
  }
  if (deleted.storage_path) {
    await deleteOwnedFile(deleted.storage_path, auth!.user!.id);
  }
  return applyCorsHeaders(NextResponse.json({ success: true, deletedFileId: id }));
}
