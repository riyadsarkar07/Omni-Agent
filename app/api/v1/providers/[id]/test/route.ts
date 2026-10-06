import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { ModelRouter } from '@/lib/providers/router';
import { sanitizeProviderError } from '@/lib/providers/secrets';
import { requireAdmin } from '@/lib/auth/rbac';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const denied = requireAdmin(auth);
  if (denied) return denied;

  try {
    const { id } = await params;
    const provider = await DatabaseStore.getProvider(id, true);
    if (!provider) {
      return applyCorsHeaders(NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 }));
    }

    const startTime = Date.now();
    const result = await ModelRouter.testConnection(provider);
    const latencyMs = Date.now() - startTime;
    const updatedStatus = result.success ? 'Connected' : result.status;

    await DatabaseStore.updateProvider(id, {
      connectionStatus: updatedStatus,
      lastTested: new Date().toISOString(),
      latencyMs: result.success ? latencyMs : null,
      models: result.models && result.models.length > 0 ? result.models : undefined,
    });

    return applyCorsHeaders(
      NextResponse.json({
        success: result.success,
        status: updatedStatus,
        reachable: Boolean(result.reachable ?? result.success),
        authenticated: Boolean(result.authenticated ?? result.success),
        modelAvailable: Boolean(result.modelAvailable ?? result.success),
        models: result.models || provider.models || [],
        latencyMs: result.success ? latencyMs : null,
        error: result.error ? sanitizeProviderError(result.error) : null,
      })
    );
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ success: false, error: sanitizeProviderError((err as Error).message) }, { status: 500 })
    );
  }
}
