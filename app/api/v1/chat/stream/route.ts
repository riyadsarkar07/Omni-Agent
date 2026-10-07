import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { allowedCorsOrigin } from '@/lib/auth/cors';
import { DatabaseStore } from '@/lib/db/store';
import { AgentEngine } from '@/lib/agent-engine';
import { hasAdminPrivileges } from '@/lib/auth/rbac';
import { userCanExecuteAgent, userCanReadConversation } from '@/lib/auth/access';
import { enforceUserQuota } from '@/lib/auth/quota';

const chatStreamSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000),
  agentId: z.string().optional(),
  conversationId: z.string().optional(),
  overrideModel: z.string().optional(),
  overrideProviderId: z.string().optional(),
  thinkingLevel: z.enum(['HIGH', 'LOW', 'MINIMAL', 'OFF']).optional(),
});

export async function OPTIONS(req: NextRequest) {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }), req);
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return errorResponse;
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const quotaDenied = await enforceUserQuota(auth.user, req);
  if (quotaDenied) return quotaDenied;

  try {
    const rawBody = await req.json();
    const parseResult = chatStreamSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { message, agentId, conversationId, overrideModel, overrideProviderId, thinkingLevel } = parseResult.data;

    if (conversationId) {
      const existing = await DatabaseStore.getConversation(conversationId);
      if (!existing || !(await userCanReadConversation(auth, existing.conversation))) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
    }

    let targetAgent = null;
    if (agentId) {
      targetAgent = await DatabaseStore.getAgent(agentId);
      if (!targetAgent || !(await userCanExecuteAgent(auth, targetAgent))) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }
    } else {
      const agents = await DatabaseStore.listVisibleAgents(
        auth.user?.id,
        hasAdminPrivileges(auth),
        hasAdminPrivileges(auth) ? auth.project.id : undefined
      );
      targetAgent = agents[0] || null;
    }

    if (!targetAgent) {
      return NextResponse.json({ error: 'No active agent available for this project' }, { status: 400 });
    }

    if (overrideProviderId) {
      targetAgent = {
        ...targetAgent,
        provider_id: overrideProviderId,
      };
    }

    const stream = await AgentEngine.executeChatStream({
      agent: targetAgent,
      message,
      conversationId,
      projectId: auth.project.id,
      apiKeyId: auth.apiKey?.id,
      userId: auth.user?.id,
      overrideModel,
      overrideThinkingLevel: thinkingLevel,
    });

    const origin = allowedCorsOrigin(req.headers.get('origin'));
    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    };
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Credentials'] = 'true';
      headers.Vary = 'Origin';
    }
    return new Response(stream, { headers });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Streaming Execution Failed', message: (err as Error).message },
      { status: 500 }
    );
  }
}
