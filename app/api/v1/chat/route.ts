import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { AgentEngine } from '@/lib/agent-engine';
import { canAccessConversation, canExecuteAgent } from '@/lib/auth/rbac';

const chatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000, 'Message exceeds 10,000 character limit'),
  agentId: z.string().optional(),
  conversationId: z.string().optional(),
  overrideModel: z.string().optional(),
  overrideProviderId: z.string().optional(),
  thinkingLevel: z.enum(['HIGH', 'LOW', 'MINIMAL', 'OFF']).optional(),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  try {
    const rawBody = await req.json();
    const parseResult = chatSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return applyCorsHeaders(
        NextResponse.json(
          {
            error: 'Validation Error',
            details: parseResult.error.flatten().fieldErrors,
          },
          { status: 400 }
        )
      );
    }

    const { message, agentId, conversationId, overrideModel, overrideProviderId, thinkingLevel } = parseResult.data;

    let conversationUserId = auth.user?.id;
    if (conversationId) {
      const existing = await DatabaseStore.getConversation(conversationId);
      if (!existing || !canAccessConversation(auth, existing.conversation)) {
        return applyCorsHeaders(NextResponse.json({ error: 'Conversation not found' }, { status: 404 }));
      }
      conversationUserId = DatabaseStore.conversationOwnerId(existing.conversation) || auth.user?.id;
    }

    // Resolve agent: if agentId provided, verify it belongs to project and is executable
    let targetAgent = null;
    if (agentId) {
      targetAgent = await DatabaseStore.getAgent(agentId);
      if (!targetAgent || !canExecuteAgent(auth, targetAgent)) {
        return applyCorsHeaders(
          NextResponse.json({ error: 'Agent not found in authenticated project' }, { status: 404 })
        );
      }
    } else {
      // Default to first published agent of project
      const agents = await DatabaseStore.listAgents(auth.project.id);
      targetAgent = (auth.isAdmin ? agents : agents.filter((a) => a.is_published))[0] || null;
    }

    if (!targetAgent) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'No active agent available for this project' }, { status: 400 })
      );
    }

    if (overrideProviderId) {
      targetAgent = {
        ...targetAgent,
        provider_id: overrideProviderId,
      };
    }

    // Execute chat with AI Agent Engine
    const result = await AgentEngine.executeChat({
      agent: targetAgent,
      message,
      conversationId,
      projectId: auth.project.id,
      apiKeyId: auth.apiKey?.id,
      userId: conversationUserId,
      overrideModel,
      overrideThinkingLevel: thinkingLevel,
    });

    const response = NextResponse.json({
      message: result.text,
      conversationId: result.conversationId,
      model: result.model,
      toolCalls: result.toolCallsExecuted,
      usage: {
        promptTokens: result.promptTokens,
        candidateTokens: result.candidateTokens,
        totalTokens: result.totalTokens,
        latencyMs: result.latencyMs,
      },
    });

    return applyCorsHeaders(response);
  } catch (err: unknown) {
    const errorMsg = (err as Error).message || 'Internal Agent Chat Error';
    return applyCorsHeaders(
      NextResponse.json(
        {
          error: 'Agent Execution Failed',
          message: errorMsg,
        },
        { status: 500 }
      )
    );
  }
}
