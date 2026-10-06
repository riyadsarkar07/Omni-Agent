import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { AgentEngine } from '@/lib/agent-engine';
import { canAccessConversation, canExecuteAgent } from '@/lib/auth/rbac';

const chatStreamSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000),
  agentId: z.string().optional(),
  conversationId: z.string().optional(),
  overrideModel: z.string().optional(),
  overrideProviderId: z.string().optional(),
  thinkingLevel: z.enum(['HIGH', 'LOW', 'MINIMAL', 'OFF']).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-internal-admin',
    },
  });
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return errorResponse;
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    let conversationUserId = auth.user?.id;
    if (conversationId) {
      const existing = await DatabaseStore.getConversation(conversationId);
      if (!existing || !canAccessConversation(auth, existing.conversation)) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
      }
      conversationUserId = DatabaseStore.conversationOwnerId(existing.conversation) || auth.user?.id;
    }

    let targetAgent = null;
    if (agentId) {
      targetAgent = await DatabaseStore.getAgent(agentId);
      if (!targetAgent || !canExecuteAgent(auth, targetAgent)) {
        return NextResponse.json({ error: 'Agent not found in authenticated project' }, { status: 404 });
      }
    } else {
      const agents = await DatabaseStore.listAgents(auth.project.id);
      targetAgent = (auth.isAdmin ? agents : agents.filter((a) => a.is_published))[0] || null;
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
      userId: conversationUserId,
      overrideModel,
      overrideThinkingLevel: thinkingLevel,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: 'Streaming Execution Failed', message: (err as Error).message },
      { status: 500 }
    );
  }
}
