import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DatabaseStore } from '@/lib/db/store';
import { applyCorsHeaders } from '@/lib/auth/middleware';

const schema = z.object({
  accessToken: z.string().min(10),
  password: z.string().min(8).max(128),
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
    await DatabaseStore.updateOwnPassword(parse.data.accessToken, parse.data.password);
    return applyCorsHeaders(NextResponse.json({ message: 'Password updated' }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: (err as Error).message || 'Failed to update password' }, { status: 400 })
    );
  }
}
