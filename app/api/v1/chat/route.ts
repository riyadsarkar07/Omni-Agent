import { NextRequest, NextResponse } from 'next/server';
import { applyCorsHeaders } from '@/lib/auth/middleware';
import {
  authenticateChat,
  capabilityErrorResponse,
  parseAndPrepareChat,
  resolveChatAgent,
  runPreparedChat,
} from '@/lib/chat/request';
import { CapabilityError } from '@/lib/chat/multimodal';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const gated = await authenticateChat(req);
  if ('error' in gated && gated.error) return gated.error;
  const auth = gated.auth!;

  try {
    const rawBody = await req.json();
    const parsed = await parseAndPrepareChat(auth, rawBody);
    if ('error' in parsed && parsed.error) return parsed.error;
    const { data, prepared } = parsed;

    const resolved = await resolveChatAgent(auth, data.agentId, data.overrideProviderId);
    if ('error' in resolved) return resolved.error;

    const result = await runPreparedChat({
      auth,
      agent: resolved.agent,
      data,
      prepared,
      stream: false,
    });

    return applyCorsHeaders(
      NextResponse.json({
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
      })
    );
  } catch (err: unknown) {
    if (err instanceof CapabilityError) return capabilityErrorResponse(err);
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
