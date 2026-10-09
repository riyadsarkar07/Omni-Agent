import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { AgentEngine } from '@/lib/agent-engine';
import { hasAdminPrivileges } from '@/lib/auth/rbac';
import { userCanExecuteAgent, userCanMutateConversation } from '@/lib/auth/access';
import { enforceUserQuota } from '@/lib/auth/quota';
import { ChatRequestBody, chatRequestSchema, prepareChatInput } from './multimodal';
import { Agent } from '../types';

export { chatRequestSchema };
export type { ChatRequestBody };

export function capabilityErrorResponse(
  err: { code: string; message: string; suggested?: unknown; status?: number },
  cors = true
): NextResponse {
  const body = {
    error: err.code === 'VISION_UNSUPPORTED' ? 'Vision Unsupported' : 'Attachment Error',
    code: err.code,
    message: err.message,
    suggested: err.suggested,
  };
  const res = NextResponse.json(body, { status: err.status || 400 });
  return cors ? applyCorsHeaders(res) : res;
}

export async function authenticateChat(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return { error: applyCorsHeaders(errorResponse) };
  if (!auth) return { error: applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 })) };
  const quotaDenied = await enforceUserQuota(auth.user, req);
  if (quotaDenied) return { error: quotaDenied };
  return { auth };
}

export async function resolveChatAgent(
  auth: NonNullable<Awaited<ReturnType<typeof authenticateApiRequest>>['auth']>,
  agentId?: string,
  overrideProviderId?: string
): Promise<{ agent: Agent } | { error: NextResponse }> {
  let targetAgent = null;
  if (agentId) {
    targetAgent = await DatabaseStore.getAgent(agentId);
    if (!targetAgent || !(await userCanExecuteAgent(auth, targetAgent))) {
      return { error: applyCorsHeaders(NextResponse.json({ error: 'Agent not found' }, { status: 404 })) };
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
    return {
      error: applyCorsHeaders(
        NextResponse.json({ error: 'No active agent available for this project' }, { status: 400 })
      ),
    };
  }

  if (overrideProviderId) {
    targetAgent = {
      ...targetAgent,
      provider_id: overrideProviderId,
    };
  }
  return { agent: targetAgent };
}

export async function parseAndPrepareChat(auth: NonNullable<Awaited<ReturnType<typeof authenticateApiRequest>>['auth']>, rawBody: unknown) {
  const parseResult = chatRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return {
      error: applyCorsHeaders(
        NextResponse.json(
          {
            error: 'Validation Error',
            details: parseResult.error.flatten().fieldErrors,
          },
          { status: 400 }
        )
      ),
    };
  }

  const data = parseResult.data;
  const attachmentIds = data.attachmentIds || [];
  const message = (data.message || '').trim();
  if (!message && attachmentIds.length === 0) {
    return {
      error: applyCorsHeaders(
        NextResponse.json(
          { error: 'Validation Error', message: 'Message or attachment is required' },
          { status: 400 }
        )
      ),
    };
  }

  if (data.conversationId) {
    const existing = await DatabaseStore.getConversation(data.conversationId);
    if (!existing || !(await userCanMutateConversation(auth, existing.conversation))) {
      return { error: applyCorsHeaders(NextResponse.json({ error: 'Conversation not found' }, { status: 404 })) };
    }
  }

  const prepared = await prepareChatInput({
    userId: auth.user?.id,
    message,
    attachmentIds,
  });

  return { data, prepared };
}

export async function runPreparedChat(params: {
  auth: NonNullable<Awaited<ReturnType<typeof authenticateApiRequest>>['auth']>;
  agent: Agent;
  data: ChatRequestBody;
  prepared: Awaited<ReturnType<typeof prepareChatInput>>;
  stream: false;
}): Promise<Awaited<ReturnType<typeof AgentEngine.executeChat>>>;
export async function runPreparedChat(params: {
  auth: NonNullable<Awaited<ReturnType<typeof authenticateApiRequest>>['auth']>;
  agent: Agent;
  data: ChatRequestBody;
  prepared: Awaited<ReturnType<typeof prepareChatInput>>;
  stream: true;
}): Promise<ReadableStream<Uint8Array>>;
export async function runPreparedChat(params: {
  auth: NonNullable<Awaited<ReturnType<typeof authenticateApiRequest>>['auth']>;
  agent: Agent;
  data: ChatRequestBody;
  prepared: Awaited<ReturnType<typeof prepareChatInput>>;
  stream: boolean;
}) {
  const options = {
    agent: params.agent,
    message: params.prepared.modelText,
    storedMessage: params.prepared.storedMessage,
    images: params.prepared.images,
    conversationId: params.data.conversationId,
    projectId: params.auth.project.id,
    apiKeyId: params.auth.apiKey?.id,
    userId: params.auth.user?.id,
    overrideModel: params.data.overrideModel,
    overrideThinkingLevel: params.data.thinkingLevel,
    useKnowledge: true,
    knowledgeQuery: (params.data.message || '').trim() || params.prepared.storedMessage,
  };
  if (params.stream) return AgentEngine.executeChatStream(options);
  return AgentEngine.executeChat(options);
}
