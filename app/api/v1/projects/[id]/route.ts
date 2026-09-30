import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { getAdminEmail } from '@/lib/config';

const updateProjectSchema = z.object({
  name: z.string().min(2).max(60).optional(),
  description: z.string().max(250).optional(),
  rate_limit_rpm: z.number().int().min(10).max(1000).optional(),
  is_active: z.boolean().optional(),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const { id } = await params;
  const project = await DatabaseStore.getProject(id);
  if (!project) {
    return applyCorsHeaders(NextResponse.json({ error: 'Project not found' }, { status: 404 }));
  }

  try {
    const rawBody = await req.json();
    const parseResult = updateProjectSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors }, { status: 400 })
      );
    }

    const updated = await DatabaseStore.updateProject(id, parseResult.data);

    await DatabaseStore.logAudit({
      project_id: id,
      user_email: getAdminEmail() || 'system',
      action: 'PROJECT_UPDATED',
      resource_type: 'project',
      resource_id: id,
      details: parseResult.data,
    });

    return applyCorsHeaders(NextResponse.json({ project: updated }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to update project', message: (err as Error).message }, { status: 500 })
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const { id } = await params;
  const project = await DatabaseStore.getProject(id);
  if (!project) {
    return applyCorsHeaders(NextResponse.json({ error: 'Project not found' }, { status: 404 }));
  }

  const success = await DatabaseStore.deleteProject(id);
  return applyCorsHeaders(NextResponse.json({ success, deletedProjectId: id }));
}
