import { NextRequest, NextResponse } from 'next/server';
import { applyCorsHeaders } from '@/lib/auth/middleware';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('omniagent_session')?.value;
  if (token) {
    // Session token cleanup
  }
  const res = NextResponse.json({ message: 'Logged out successfully' });
  res.cookies.delete('omniagent_session');
  return applyCorsHeaders(res);
}
