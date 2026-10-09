import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { modelLooksLikeVision, providerSupportsVision } from '@/lib/chat/multimodal';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  try {
    const [providers, settings] = await Promise.all([
      DatabaseStore.listProviders(),
      DatabaseStore.getPlatformSettings().catch(() => ({ default_model: null })),
    ]);
    const userDefault = auth.user?.preferences?.default_model || null;
    const models = providers
      .filter((p) => p.enabled)
      .flatMap((p) =>
        (p.models || []).map((model) => ({
          id: model,
          providerId: p.id,
          providerName: p.name,
          protocol: p.protocol,
          capabilities: p.capabilities || [],
          vision: providerSupportsVision(p, model) || modelLooksLikeVision(model),
          isDefault: p.isDefault && p.defaultModel === model,
        }))
      );

    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        models,
        defaultModel:
          userDefault ||
          settings.default_model ||
          providers.find((p) => p.isDefault)?.defaultModel ||
          models[0]?.id ||
          null,
      })
    );
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 })
    );
  }
}
