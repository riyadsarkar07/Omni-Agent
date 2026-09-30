import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';

const createAgentSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(80),
  description: z.string().max(250).default(''),
  model: z.enum(['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-flash-latest']).default('gemini-3.8-flash'),
  system_instructions: z.string().min(5, 'Instructions must be at least 5 characters').max(10000),
  temperature: z.number().min(0).max(2).default(0.7),
  top_p: z.number().min(0).max(1).default(0.95),
  top_k: z.number().min(1).max(64).default(40),
  max_output_tokens: z.number().positive().optional(),
  thinking_level: z.enum(['HIGH', 'LOW', 'MINIMAL', 'OFF']).default('OFF'),
  memory_enabled: z.boolean().default(true),
  tools_enabled: z.array(z.string()).default([]),
  is_published: z.boolean().default(true),
  project_id: z.string().optional(),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const projectId = req.nextUrl.searchParams.get('projectId') || (auth.isAdmin ? undefined : auth.project.id);
  const agents = await DatabaseStore.listAgents(projectId);

  return applyCorsHeaders(NextResponse.json({ agents, total: agents.length }));
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  try {
    const rawBody = await req.json();
    const parseResult = createAgentSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors }, { status: 400 })
      );
    }

    const payload = parseResult.data;
    const targetProjectId = payload.project_id || auth.project.id;

    const newAgent = await DatabaseStore.createAgent({
      ...payload,
      project_id: targetProjectId,
    });

    await DatabaseStore.logAudit({
      project_id: targetProjectId,
      user_email: 'api_user@omniagent.io',
      action: 'AGENT_CREATED',
      resource_type: 'agent',
      resource_id: newAgent.id,
      details: { name: newAgent.name, model: newAgent.model },
    });

    return applyCorsHeaders(NextResponse.json({ agent: newAgent }, { status: 201 }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to create agent', message: (err as Error).message }, { status: 500 })
    );
  }
}
