import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const { id } = await params;
  const keys = await DatabaseStore.listApiKeys();
  const existingKey = keys.find((k) => k.id === id);

  if (!existingKey || (existingKey.project_id !== auth.project.id && !auth.isAdmin)) {
    return applyCorsHeaders(NextResponse.json({ error: 'API Key not found' }, { status: 404 }));
  }

  // Revoke key
  await DatabaseStore.revokeApiKey(id);

  await DatabaseStore.logAudit({
    project_id: existingKey.project_id,
    user_email: 'admin@omniagent.io',
    action: 'API_KEY_REVOKED',
    resource_type: 'api_key',
    resource_id: id,
    details: { keyPrefix: existingKey.key_prefix, name: existingKey.name },
  });

  return applyCorsHeaders(NextResponse.json({ success: true, message: 'API Key successfully revoked' }));
}
