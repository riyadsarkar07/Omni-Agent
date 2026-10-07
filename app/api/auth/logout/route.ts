import { NextRequest, NextResponse } from 'next/server';
import { applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get('omniagent_session')?.value;
  if (token) {
    try {
      const user = await DatabaseStore.verifySessionToken(token);
      if (user) {
        const projects = await DatabaseStore.listProjects();
        await DatabaseStore.logAudit({
          project_id: projects[0]?.id || 'proj_default_core',
          user_email: user.email,
          action: 'USER_LOGOUT',
          resource_type: 'session',
          resource_id: user.id,
        });
      }
      await DatabaseStore.logoutSession(token);
    } catch {
      //
    }
  }
  const res = NextResponse.json({ message: 'Logged out successfully' });
  res.cookies.delete('omniagent_session');
  return applyCorsHeaders(res);
}
