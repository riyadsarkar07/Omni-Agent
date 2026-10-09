import { NextRequest, NextResponse } from 'next/server';
import { applyCorsHeaders } from '@/lib/auth/middleware';
import { allowedCorsOrigin } from '@/lib/auth/cors';
import {
  authenticateChat,
  capabilityErrorResponse,
  parseAndPrepareChat,
  resolveChatAgent,
  runPreparedChat,
} from '@/lib/chat/request';
import { CapabilityError } from '@/lib/chat/multimodal';

export async function OPTIONS(req: NextRequest) {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }), req);
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

    const stream = await runPreparedChat({
      auth,
      agent: resolved.agent,
      data,
      prepared,
      stream: true,
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
    if (err instanceof CapabilityError) return capabilityErrorResponse(err, false);
    return NextResponse.json(
      { error: 'Streaming Execution Failed', message: (err as Error).message },
      { status: 500 }
    );
  }
}
