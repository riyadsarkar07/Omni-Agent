import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';

const updateAgentSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(250).optional(),
  model: z.enum(['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-flash-latest']).optional(),
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

  if (!agent || (agent.project_id !== auth.project.id && !auth.isAdmin)) {
    return applyCorsHeaders(NextResponse.json({ error: 'Agent not found' }, { status: 404 }));
  }

  return applyCorsHeaders(NextResponse.json({ agent }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const { id } = await params;
  const existingAgent = await DatabaseStore.getAgent(id);

  if (!existingAgent || (existingAgent.project_id !== auth.project.id && !auth.isAdmin)) {
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

    const updated = await DatabaseStore.updateAgent(id, {
      ...parseResult.data,
      max_output_tokens: parseResult.data.max_output_tokens === null ? undefined : parseResult.data.max_output_tokens,
    });

    await DatabaseStore.logAudit({
      project_id: existingAgent.project_id,
      user_email: 'api_user@omniagent.io',
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

  const { id } = await params;
  const existingAgent = await DatabaseStore.getAgent(id);

  if (!existingAgent || (existingAgent.project_id !== auth.project.id && !auth.isAdmin)) {
    return applyCorsHeaders(NextResponse.json({ error: 'Agent not found' }, { status: 404 }));
  }

  await DatabaseStore.deleteAgent(id);

  await DatabaseStore.logAudit({
    project_id: existingAgent.project_id,
    user_email: 'api_user@omniagent.io',
    action: 'AGENT_DELETED',
    resource_type: 'agent',
    resource_id: id,
    details: { name: existingAgent.name },
  });

  return applyCorsHeaders(NextResponse.json({ success: true, deletedAgentId: id }));
}
