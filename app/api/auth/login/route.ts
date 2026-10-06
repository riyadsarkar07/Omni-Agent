import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DatabaseStore } from '@/lib/db/store';
import { applyCorsHeaders } from '@/lib/auth/middleware';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parse = loginSchema.safeParse(body);
    if (!parse.success) {
      return applyCorsHeaders(
        NextResponse.json(
          { error: 'Validation Error', details: parse.error.flatten().fieldErrors },
          { status: 400 }
        )
      );
    }

    const { email, password } = parse.data;

    const session = await DatabaseStore.loginUser(email, password);

    try {
      const projects = await DatabaseStore.listProjects();
      await DatabaseStore.logAudit({
        project_id: projects[0]?.id || 'proj_default_core',
        user_email: session.user.email,
        action: 'USER_LOGIN',
        resource_type: 'session',
        resource_id: session.user.id,
        details: { role: session.user.role },
      });
    } catch {
      //
    }

    const res = NextResponse.json({
      message: 'Login successful',
      user: session.user,
      session,
    });

    res.cookies.set('omniagent_session', session.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return applyCorsHeaders(res);
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: (err as Error).message || 'Invalid credentials' }, { status: 401 })
    );
  }
}
