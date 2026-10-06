import { NextRequest, NextResponse } from 'next/server';
import { DatabaseStore } from '@/lib/db/store';
import { applyCorsHeaders } from '@/lib/auth/middleware';
import { isUserActive } from '@/lib/auth/rbac';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('omniagent_session')?.value || req.headers.get('authorization')?.replace(/^Bearer /i, '');

  if (!token) {
    return applyCorsHeaders(
      NextResponse.json({ authenticated: false, user: null }, { status: 200 })
    );
  }

  const user = await DatabaseStore.verifySessionToken(token);
  if (!user || !isUserActive(user)) {
    return applyCorsHeaders(
      NextResponse.json({ authenticated: false, user: null }, { status: 200 })
    );
  }

  return applyCorsHeaders(
    NextResponse.json({ authenticated: true, user }, { status: 200 })
  );
}
