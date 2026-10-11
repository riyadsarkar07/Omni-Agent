import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { actorEmail, requireAdmin } from '@/lib/auth/rbac';
import { validateRoutingSettings } from '@/lib/providers/routing-policy';

const settingsSchema = z.object({
  default_model: z.string().min(1).max(200).nullable().optional(),
  admin_contact_email: z.string().email().nullable().optional(),
  routing: z.unknown().optional(),
});

export async function OPTIONS(req: NextRequest) {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }), req);
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse, req);
  const denied = requireAdmin(auth);
  if (denied) return denied;

  const settings = await DatabaseStore.getPlatformSettings();
  return applyCorsHeaders(NextResponse.json({ settings }), req);
}

export async function PATCH(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse, req);
  const denied = requireAdmin(auth);
  if (denied) return denied;

  try {
    const body = await req.json();
    const parse = settingsSchema.safeParse(body);
    if (!parse.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parse.error.flatten().fieldErrors }, { status: 400 }),
        req
      );
    }

    const routingCheck = parse.data.routing !== undefined ? validateRoutingSettings(parse.data.routing) : { ok: true as const, value: undefined };
    if (!routingCheck.ok) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: { routing: [routingCheck.error] } }, { status: 400 }),
        req
      );
    }
    const settings = await DatabaseStore.updatePlatformSettings(
      {
        default_model: parse.data.default_model,
        admin_contact_email: parse.data.admin_contact_email,
        ...(routingCheck.value ? { routing: routingCheck.value } : {}),
      },
      actorEmail(auth)
    );
    await DatabaseStore.logAudit({
      project_id: auth?.project.id || 'proj_default_core',
      user_email: actorEmail(auth),
      action: 'SETTINGS_UPDATED',
      resource_type: 'settings',
      resource_id: 'global',
      details: parse.data,
    });
    return applyCorsHeaders(NextResponse.json({ settings }), req);
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to update settings', message: (err as Error).message }, { status: 500 }),
      req
    );
  }
}
