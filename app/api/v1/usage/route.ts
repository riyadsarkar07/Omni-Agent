import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { hasAdminPrivileges } from '@/lib/auth/rbac';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const isAdmin = hasAdminPrivileges(auth);
  const projectId = isAdmin
    ? req.nextUrl.searchParams.get('projectId') || undefined
    : undefined;
  const requestedUserId = req.nextUrl.searchParams.get('userId') || undefined;
  const userId = isAdmin ? requestedUserId : auth.user?.id;
  if (!isAdmin && !userId) {
    return applyCorsHeaders(
      NextResponse.json({
        summary: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          totalTokens: 0,
          promptTokens: 0,
          candidateTokens: 0,
          avgLatencyMs: 0,
        },
        recentLogs: [],
      })
    );
  }
  const stats = await DatabaseStore.getUsageStats(projectId, userId);
  const monthlyUsed = userId ? await DatabaseStore.countUserUsageThisMonth(userId) : 0;
  const monthlyQuota = !isAdmin ? auth.user?.preferences?.monthly_request_quota ?? 500 : null;

  const redactedLogs = stats.recentLogs.map((log) => ({
    id: log.id,
    project_id: log.project_id,
    agent_id: log.agent_id,
    user_id: isAdmin ? log.user_id || null : undefined,
    endpoint: log.endpoint,
    model: log.model,
    prompt_tokens: log.prompt_tokens,
    candidate_tokens: log.candidate_tokens,
    total_tokens: log.total_tokens,
    status_code: log.status_code,
    latency_ms: log.latency_ms,
    error_message: isAdmin ? log.error_message : null,
    created_at: log.created_at,
  }));

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
      quota: monthlyQuota
        ? {
            monthlyUsed,
            monthlyLimit: monthlyQuota,
            remaining: Math.max(monthlyQuota - monthlyUsed, 0),
          }
        : undefined,
    })
  );
}
