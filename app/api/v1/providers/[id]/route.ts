import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { getProviderTypeOption, protocolFromKind, isValidHttpUrl, normalizeProviderBaseUrl } from '@/lib/providers/catalog';
import { ProviderKind, ProviderMetadata, ProviderProtocol } from '@/lib/providers/types';
import { sanitizeProviderError } from '@/lib/providers/secrets';
import { requireAdmin, actorEmail } from '@/lib/auth/rbac';
import { validateProviderEndpoint } from '@/lib/providers/endpoint';

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
    const provider = await DatabaseStore.getProvider(id);
    if (!provider) {
      return applyCorsHeaders(NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 }));
    }
    return applyCorsHeaders(NextResponse.json({ success: true, provider }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ success: false, error: sanitizeProviderError((err as Error).message) }, { status: 500 })
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const denied = requireAdmin(auth);
  if (denied) return denied;

  try {
    const { id } = await params;
    const existing = await DatabaseStore.getProvider(id, true);
    if (!existing) {
      return applyCorsHeaders(NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 }));
    }

    const body = await req.json();
    const type = (body.type as ProviderKind) || existing.type;
    const option = getProviderTypeOption(type);
    const protocol = (body.protocol as ProviderProtocol) || existing.protocol || protocolFromKind(option.id);
    const baseUrl = body.baseUrl !== undefined ? normalizeProviderBaseUrl(String(body.baseUrl).trim()) : existing.baseUrl;

    if (protocol !== 'gemini' && baseUrl) {
      if (!isValidHttpUrl(baseUrl)) {
        return applyCorsHeaders(
          NextResponse.json({ success: false, error: 'Base URL must be a valid http or https URL' }, { status: 400 })
        );
      }
      const endpoint = validateProviderEndpoint(baseUrl);
      if (!endpoint.ok) {
        return applyCorsHeaders(NextResponse.json({ success: false, error: endpoint.error }, { status: 400 }));
      }
    }

    const metadata: ProviderMetadata = {
      ...(existing.metadata || {}),
      ...(body.metadata || {}),
    };
    if (body.organizationId !== undefined) metadata.organizationId = body.organizationId;
    if (body.apiVersion !== undefined) metadata.apiVersion = body.apiVersion;
    if (body.customHeaders !== undefined) metadata.customHeaders = body.customHeaders;
    if (body.requestTimeoutMs !== undefined) metadata.requestTimeoutMs = Number(body.requestTimeoutMs);
    if (body.maxRetries !== undefined) metadata.maxRetries = Number(body.maxRetries);
    if (body.temperature !== undefined) metadata.temperature = Number(body.temperature);
    if (body.maxTokens !== undefined) metadata.maxTokens = Number(body.maxTokens);
    if (body.streamingEnabled !== undefined) metadata.streamingEnabled = Boolean(body.streamingEnabled);

    const modelId = body.model !== undefined ? String(body.model).trim() : body.defaultModel !== undefined ? String(body.defaultModel).trim() : undefined;
    const models = Array.isArray(body.models)
      ? body.models.filter((m: unknown): m is string => typeof m === 'string' && m.trim().length > 0)
      : undefined;

    const updated = await DatabaseStore.updateProvider(id, {
      name: body.name !== undefined ? String(body.name).trim() : existing.name,
      type: option.id,
      protocol,
      baseUrl,
      apiKey: typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : undefined,
      enabled: body.enabled !== undefined ? Boolean(body.enabled) : existing.enabled,
      defaultModel: modelId !== undefined ? modelId : existing.defaultModel,
      models,
      capabilities: body.capabilities || existing.capabilities,
      connectionStatus: body.connectionStatus || existing.connectionStatus,
      lastTested: body.lastTested !== undefined ? body.lastTested : existing.lastTested,
      latencyMs: body.latencyMs !== undefined ? body.latencyMs : existing.latencyMs,
      isDefault: body.isDefault !== undefined ? Boolean(body.isDefault) : existing.isDefault,
      metadata,
    });

    if (!updated) {
      return applyCorsHeaders(NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 }));
    }

    await DatabaseStore.logAudit({
      project_id: auth.project.id,
      user_email: actorEmail(auth),
      action: 'PROVIDER_UPDATED',
      resource_type: 'provider',
      resource_id: id,
      details: { name: updated.name, enabled: updated.enabled },
    });

    return applyCorsHeaders(NextResponse.json({ success: true, provider: updated }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ success: false, error: sanitizeProviderError((err as Error).message) }, { status: 500 })
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const denied = requireAdmin(auth);
  if (denied) return denied;

  try {
    const { id } = await params;
    const existing = await DatabaseStore.getProvider(id);
    if (!existing) {
      return applyCorsHeaders(NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 }));
    }

    const deleted = await DatabaseStore.deleteProvider(id);
    if (!deleted) {
      return applyCorsHeaders(NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 }));
    }

    await DatabaseStore.logAudit({
      project_id: auth.project.id,
      user_email: actorEmail(auth),
      action: 'PROVIDER_DELETED',
      resource_type: 'provider',
      resource_id: id,
      details: { name: existing.name },
    });

    return applyCorsHeaders(NextResponse.json({ success: true, message: 'Provider deleted successfully' }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ success: false, error: sanitizeProviderError((err as Error).message) }, { status: 500 })
    );
  }
}
