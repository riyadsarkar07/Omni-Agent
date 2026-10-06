import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { getAdminEmail } from '@/lib/config';
import { requireAdmin, actorEmail } from '@/lib/auth/rbac';

const createProjectSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(60),
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase alphanumeric characters and dashes').optional(),
  description: z.string().max(250).default(''),
  rate_limit_rpm: z.number().int().min(10).max(1000).default(60),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const projects = await DatabaseStore.listProjects();
  return applyCorsHeaders(NextResponse.json({ projects, total: projects.length }));
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const denied = requireAdmin(auth);
  if (denied) return denied;

  try {
    const rawBody = await req.json();
    const parseResult = createProjectSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors }, { status: 400 })
      );
    }

    const { name, slug, description, rate_limit_rpm } = parseResult.data;
    const computedSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    const newProject = await DatabaseStore.createProject({
      name,
      slug: computedSlug,
      description,
      rate_limit_rpm,
    });

    await DatabaseStore.logAudit({
      project_id: newProject.id,
      user_email: actorEmail(auth) || getAdminEmail() || 'system',
      action: 'PROJECT_CREATED',
      resource_type: 'project',
      resource_id: newProject.id,
      details: { name: newProject.name, slug: newProject.slug },
    });

    return applyCorsHeaders(NextResponse.json({ project: newProject }, { status: 201 }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to create project', message: (err as Error).message }, { status: 500 })
    );
  }
}
