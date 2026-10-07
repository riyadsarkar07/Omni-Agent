import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { actorEmail, canManageAgent, hasAdminPrivileges, requireSessionUser } from '@/lib/auth/rbac';
import { userCanExecuteAgent } from '@/lib/auth/access';

const updateAgentSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(250).optional(),
  model: z.string().min(1).max(200).optional(),
  provider_id: z.string().optional(),
  fallback_provider_id: z.string().nullable().optional(),
  fallback_model: z.string().nullable().optional(),
  system_instructions: z.string().min(5).max(10000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().min(1).max(64).optional(),
  max_output_tokens: z.number().positive().nullable().optional(),
  thinking_level: z.enum(['HIGH', 'LOW', 'MINIMAL', 'OFF']).optional(),
  memory_enabled: z.boolean().optional(),
  tools_enabled: z.array(z.string()).optional(),
  is_published: z.boolean().optional(),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const { id } = await params;
  const agent = await DatabaseStore.getAgent(id);

  if (!agent || !(await userCanExecuteAgent(auth, agent))) {
    return applyCorsHeaders(NextResponse.json({ error: 'Agent not found' }, { status: 404 }));
  }

  return applyCorsHeaders(NextResponse.json({ agent }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const denied = requireSessionUser(auth);
  if (denied) return denied;

  const { id } = await params;
  const existingAgent = await DatabaseStore.getAgent(id);

  if (!existingAgent || !canManageAgent(auth, existingAgent)) {
    return applyCorsHeaders(NextResponse.json({ error: 'Agent not found' }, { status: 404 }));
  }

  try {
    const rawBody = await req.json();
    const parseResult = updateAgentSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors }, { status: 400 })
      );
    }

    const payload = parseResult.data;
    const isAdmin = hasAdminPrivileges(auth);
    const updated = await DatabaseStore.updateAgent(id, {
      ...payload,
      fallback_provider_id: payload.fallback_provider_id ?? undefined,
      fallback_model: payload.fallback_model ?? undefined,
      max_output_tokens: payload.max_output_tokens === null ? undefined : payload.max_output_tokens,
      is_published: isAdmin ? payload.is_published : existingAgent.is_published,
    });

    await DatabaseStore.logAudit({
      project_id: existingAgent.project_id,
      user_email: actorEmail(auth),
      action: 'AGENT_UPDATED',
      resource_type: 'agent',
      resource_id: id,
      details: parseResult.data,
    });

    return applyCorsHeaders(NextResponse.json({ agent: updated }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Update Failed', message: (err as Error).message }, { status: 500 })
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const denied = requireSessionUser(auth);
  if (denied) return denied;

  const { id } = await params;
  const existingAgent = await DatabaseStore.getAgent(id);

  if (!existingAgent || !canManageAgent(auth, existingAgent)) {
    return applyCorsHeaders(NextResponse.json({ error: 'Agent not found' }, { status: 404 }));
  }

  await DatabaseStore.deleteAgent(id);

  await DatabaseStore.logAudit({
    project_id: existingAgent.project_id,
    user_email: actorEmail(auth),
    action: 'AGENT_DELETED',
    resource_type: 'agent',
    resource_id: id,
    details: { name: existingAgent.name },
  });

  return applyCorsHeaders(NextResponse.json({ success: true, deletedAgentId: id }));
}
