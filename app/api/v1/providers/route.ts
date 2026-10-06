import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { ModelRouter } from '@/lib/providers/router';
import { getProviderTypeOption, protocolFromKind, isValidHttpUrl, PROVIDER_TYPE_OPTIONS } from '@/lib/providers/catalog';
import { ProviderKind, ProviderMetadata, ProviderProtocol } from '@/lib/providers/types';
import { sanitizeProviderError } from '@/lib/providers/secrets';
import { requireAdmin, actorEmail } from '@/lib/auth/rbac';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const denied = requireAdmin(auth);
  if (denied) return denied;

  try {
    const providers = await DatabaseStore.listProviders();
    return applyCorsHeaders(
      NextResponse.json({
        success: true,
        providers,
        types: PROVIDER_TYPE_OPTIONS.map((t) => ({ id: t.id, label: t.label, protocol: t.protocol, placeholderUrl: t.placeholderUrl })),
      })
    );
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json(
        { success: false, error: sanitizeProviderError((err as Error).message || 'Failed to list providers') },
        { status: 500 }
      )
    );
  }
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const denied = requireAdmin(auth);
  if (denied) return denied;

  try {
    const body = await req.json();
    if (!body.name) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: 'Provider name is required' }, { status: 400 })
      );
    }

    const type = (body.type || 'openai-compatible') as ProviderKind;
    const option = getProviderTypeOption(type);
    const protocol = (body.protocol as ProviderProtocol) || protocolFromKind(option.id);
    const baseUrl = String(body.baseUrl || '').trim();
    const scope = 'global';

    if (protocol !== 'gemini' && baseUrl && !isValidHttpUrl(baseUrl)) {
      return applyCorsHeaders(
        NextResponse.json({ success: false, error: 'Base URL must be a valid http or https URL' }, { status: 400 })
      );
    }

    const metadata: ProviderMetadata = {
      organizationId: body.organizationId || body.metadata?.organizationId,
      apiVersion: body.apiVersion || body.metadata?.apiVersion,
      customHeaders: body.customHeaders || body.metadata?.customHeaders,
      requestTimeoutMs: Number(body.requestTimeoutMs || body.metadata?.requestTimeoutMs || 20000),
      maxRetries: Number(body.maxRetries ?? body.metadata?.maxRetries ?? 1),
      temperature: body.temperature ?? body.metadata?.temperature,
      maxTokens: body.maxTokens ?? body.metadata?.maxTokens,
      streamingEnabled: body.streamingEnabled ?? body.metadata?.streamingEnabled ?? true,
    };

    const validation = ModelRouter.validateConfig({ name: body.name, protocol, baseUrl, type });
    if (!validation.ok) {
      return applyCorsHeaders(NextResponse.json({ success: false, error: validation.error }, { status: 400 }));
    }

    const modelId = String(body.model || body.defaultModel || '').trim();
    const models = Array.isArray(body.models)
      ? body.models.filter((m: unknown): m is string => typeof m === 'string' && m.trim().length > 0)
      : modelId
        ? [modelId]
        : [];

    const provider = await DatabaseStore.createProvider({
      id: body.id,
      name: String(body.name).trim(),
      type: option.id,
      protocol,
      baseUrl,
      apiKey: body.apiKey ? String(body.apiKey).trim() : '',
      enabled: body.enabled !== false,
      defaultModel: modelId,
      models,
      capabilities: body.capabilities || option.defaultCapabilities,
      isDefault: Boolean(body.isDefault) && auth.isAdmin,
      scope,
      ownerId: undefined,
      metadata,
    });

    try {
      await DatabaseStore.logAudit({
        project_id: auth.project.id,
        user_email: actorEmail(auth),
        action: 'PROVIDER_CREATED',
        resource_type: 'provider',
        resource_id: provider.id,
        details: { name: provider.name, type: provider.type, protocol: provider.protocol },
      });
    } catch {
      // Provider save must succeed even if audit logging fails.
    }

    return applyCorsHeaders(NextResponse.json({ success: true, provider }, { status: 201 }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json(
        { success: false, error: sanitizeProviderError((err as Error).message || 'Failed to create provider') },
        { status: 500 }
      )
    );
  }
}
