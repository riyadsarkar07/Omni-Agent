import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { requireSessionUser } from '@/lib/auth/rbac';

const profileSchema = z.object({
  full_name: z.string().min(1).max(80),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function PATCH(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  if (!auth?.user) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  try {
    const body = await req.json();
    const parse = profileSchema.safeParse(body);
    if (!parse.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parse.error.flatten().fieldErrors }, { status: 400 })
      );
    }
    const updated = await DatabaseStore.updateUserProfile(auth.user.id, { full_name: parse.data.full_name });
    return applyCorsHeaders(NextResponse.json({ user: updated }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to update profile', message: (err as Error).message }, { status: 500 })
    );
  }
}
