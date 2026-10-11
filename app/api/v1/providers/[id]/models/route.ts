import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { ModelRouter } from '@/lib/providers/router';
import { sanitizeProviderError } from '@/lib/providers/secrets';
import { requireAdmin } from '@/lib/auth/rbac';
import { catalogMetadata } from '@/lib/providers/model-catalog';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const catalog = await ModelRouter.listCatalog(provider);
    if (catalog.ids.length > 0) {
      await DatabaseStore.updateProvider(id, {
        models: catalog.ids,
        availableModels: catalog.availableIds,
        catalogAvailabilityKnown: catalog.availabilityKnown,
        metadata: { modelCatalog: catalogMetadata(catalog) },
      });
    }

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        models: catalog.ids,
        availableModels: catalog.availableIds,
        availabilityKnown: catalog.availabilityKnown,
        listedCount: catalog.ids.length,
        availableCount: catalog.availableIds.length,
        discovery: catalog.ids.length > 0 ? 'ok' : 'unavailable',
      })
    );
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ success: false, error: sanitizeProviderError((err as Error).message) }, { status: 500 })
    );
  }
}
