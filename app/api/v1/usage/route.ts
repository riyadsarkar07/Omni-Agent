import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const projectId = auth.isAdmin
    ? req.nextUrl.searchParams.get('projectId') || undefined
    : auth.project.id;
  const stats = await DatabaseStore.getUsageStats(projectId);

  const redactedLogs = auth.isAdmin
    ? stats.recentLogs.map((log) => ({
        id: log.id,
        projectId: log.project_id,
        agentId: log.agent_id,
        endpoint: log.endpoint,
        model: log.model,
        promptTokens: log.prompt_tokens,
        candidateTokens: log.candidate_tokens,
        totalTokens: log.total_tokens,
        statusCode: log.status_code,
        latencyMs: log.latency_ms,
        errorMessage: log.error_message,
        createdAt: log.created_at,
      }))
    : [];

  return applyCorsHeaders(
    NextResponse.json({
      summary: {
        totalRequests: stats.totalRequests,
        successfulRequests: stats.successfulRequests,
        failedRequests: stats.failedRequests,
        totalTokens: stats.totalTokens,
        promptTokens: stats.promptTokens,
        candidateTokens: stats.candidateTokens,
        avgLatencyMs: stats.avgLatencyMs,
      },
      recentLogs: redactedLogs,
    })
  );
}
