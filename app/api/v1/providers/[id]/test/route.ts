import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { ModelRouter } from '@/lib/providers/router';
import { sanitizeProviderError } from '@/lib/providers/secrets';
import { requireAdmin } from '@/lib/auth/rbac';
import { catalogMetadata } from '@/lib/providers/model-catalog';
import { healthFromTest, publicHealth } from '@/lib/providers/health';

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

    const listed = result.models && result.models.length > 0 ? result.models : undefined;
    const health = healthFromTest(provider, {
      success: result.success,
      status: result.status,
      error: result.error,
      reachable: result.reachable,
      authenticated: result.authenticated,
      modelAvailable: result.modelAvailable,
      chatVerified: result.chatVerified,
      models: listed || provider.models,
      availableModels: result.availableModels,
      availabilityKnown: result.availabilityKnown,
      latencyMs: result.success ? latencyMs : result.latencyMs ?? latencyMs,
    });
    await DatabaseStore.updateProvider(id, {
      connectionStatus: updatedStatus,
      lastTested: new Date().toISOString(),
      latencyMs: result.success ? latencyMs : null,
      ...(listed
        ? {
            models: listed,
            availableModels: result.availableModels || [],
            catalogAvailabilityKnown: Boolean(result.availabilityKnown),
          }
        : {}),
      metadata: {
        ...(listed
          ? {
              modelCatalog: catalogMetadata({
                ids: listed,
                availableIds: result.availableModels || [],
                availabilityKnown: Boolean(result.availabilityKnown),
              }),
            }
          : {}),
        health,
      },
    });

    return applyCorsHeaders(
      NextResponse.json({
        success: result.success,
        status: updatedStatus,
        reachable: Boolean(result.reachable ?? result.success),
        authenticated: Boolean(result.authenticated ?? result.success),
        modelAvailable: Boolean(result.modelAvailable ?? result.success),
        chatVerified: Boolean(result.chatVerified),
        streamingVerified: result.streamingVerified,
        models: listed || result.models || provider.models || [],
        availableModels: result.availableModels || [],
        availabilityKnown: Boolean(result.availabilityKnown),
        listedCount: (listed || provider.models || []).length,
        availableCount: (result.availableModels || []).length,
        checks: result.checks || [],
        kind: result.kind || null,
        latencyMs: result.success ? latencyMs : null,
        error: result.error ? sanitizeProviderError(result.error) : null,
        health: publicHealth(health),
      })
    );
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ success: false, error: sanitizeProviderError((err as Error).message) }, { status: 500 })
    );
  }
}
