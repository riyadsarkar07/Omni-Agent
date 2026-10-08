import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DatabaseStore } from '@/lib/db/store';
import { applyCorsHeaders } from '@/lib/auth/middleware';
import { getAppUrl } from '@/lib/config';

const schema = z.object({
  email: z.string().email(),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  try {
    const parse = schema.safeParse(await req.json());
    if (!parse.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parse.error.flatten().fieldErrors }, { status: 400 })
      );
    }
    const redirectTo = `${getAppUrl()}/workspace`;
    try {
      await DatabaseStore.requestPasswordReset(parse.data.email.trim().toLowerCase(), redirectTo);
    } catch {
      // Always return success to avoid account enumeration.
    }
    return applyCorsHeaders(
      NextResponse.json({
        message: 'If that email exists, a password reset link has been sent.',
      })
    );
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to start password reset', message: (err as Error).message }, { status: 500 })
    );
  }
}
