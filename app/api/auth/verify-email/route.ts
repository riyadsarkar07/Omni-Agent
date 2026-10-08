import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DatabaseStore } from '@/lib/db/store';
import { applyCorsHeaders, authenticateApiRequest } from '@/lib/auth/middleware';
import { requireSessionUser } from '@/lib/auth/rbac';
import { getAppUrl } from '@/lib/config';

const schema = z.object({
  email: z.string().email().optional(),
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
    const body = await req.json().catch(() => ({}));
    const parse = schema.safeParse(body);
    const email = (parse.success && parse.data.email) || auth!.user!.email;
    await DatabaseStore.resendVerificationEmail(email, `${getAppUrl()}/workspace`);
    return applyCorsHeaders(NextResponse.json({ message: 'Verification email sent if required by the Auth provider.' }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: (err as Error).message || 'Failed to send verification email' }, { status: 400 })
    );
  }
}
