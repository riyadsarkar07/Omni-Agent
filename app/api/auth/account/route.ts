import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { requireSessionUser } from '@/lib/auth/rbac';
import { LAST_ADMIN_ERROR } from '@/lib/auth/users-sync';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function DELETE(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  try {
    await DatabaseStore.deleteOwnAccount(auth!.user!.id);
    const res = NextResponse.json({ success: true });
    res.cookies.delete('omniagent_session');
    return applyCorsHeaders(res);
  } catch (err: unknown) {
    const message = (err as Error).message;
    const lastAdmin = (err as Error & { code?: string }).code === 'LAST_ADMIN' || message === LAST_ADMIN_ERROR;
    return applyCorsHeaders(
      NextResponse.json(
        { error: lastAdmin ? LAST_ADMIN_ERROR : 'Failed to delete account', message },
        { status: lastAdmin ? 409 : 500 }
      )
    );
  }
}
