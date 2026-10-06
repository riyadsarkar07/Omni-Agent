import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { actorEmail, requireAdmin } from '@/lib/auth/rbac';

const updateUserSchema = z.object({
  role: z.enum(['admin', 'developer', 'viewer']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  full_name: z.string().min(1).max(80).optional(),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireAdmin(auth);
  if (denied) return denied;

  const { id } = await params;
  const user = await DatabaseStore.getUserById(id);
  if (!user) {
    return applyCorsHeaders(NextResponse.json({ error: 'User not found' }, { status: 404 }));
  }
  return applyCorsHeaders(NextResponse.json({ user }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const { id } = await params;
  const existing = await DatabaseStore.getUserById(id);
  if (!existing) {
    return applyCorsHeaders(NextResponse.json({ error: 'User not found' }, { status: 404 }));
  }

  try {
    const body = await req.json();
    const parse = updateUserSchema.safeParse(body);
    if (!parse.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parse.error.flatten().fieldErrors }, { status: 400 })
      );
    }

    if (existing.id === auth.user?.id && parse.data.status === 'disabled') {
      return applyCorsHeaders(
        NextResponse.json({ error: 'You cannot disable your own account' }, { status: 400 })
      );
    }

    const updated = await DatabaseStore.updateUser(id, parse.data);
    await DatabaseStore.logAudit({
      project_id: auth.project.id,
      user_email: actorEmail(auth),
      action: parse.data.status
        ? parse.data.status === 'disabled'
          ? 'USER_DISABLED'
          : 'USER_ACTIVATED'
        : parse.data.role
          ? 'USER_ROLE_CHANGED'
          : 'USER_UPDATED',
      resource_type: 'user',
      resource_id: id,
      details: parse.data,
    });

    return applyCorsHeaders(NextResponse.json({ user: updated }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to update user', message: (err as Error).message }, { status: 500 })
    );
  }
}
