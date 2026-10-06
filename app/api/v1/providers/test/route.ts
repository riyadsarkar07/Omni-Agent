import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { ModelRouter } from '@/lib/providers/router';
import { protocolFromKind, getProviderTypeOption, isValidHttpUrl } from '@/lib/providers/catalog';
import { AIProvider, ProviderKind, ProviderMetadata, ProviderProtocol } from '@/lib/providers/types';
import { sanitizeProviderError } from '@/lib/providers/secrets';
import { requireAdmin } from '@/lib/auth/rbac';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  const denied = requireAdmin(auth);
  if (denied) return denied;

  try {
    const body = await req.json();
    const type = (body.type || body.protocol || 'openai-compatible') as ProviderKind | ProviderProtocol;
    const option = getProviderTypeOption(String(type));
    const protocol = (body.protocol as ProviderProtocol) || protocolFromKind(option.id);
    const baseUrl = String(body.baseUrl || '').trim();

    if (protocol !== 'gemini' && baseUrl && !isValidHttpUrl(baseUrl)) {
      return applyCorsHeaders(
        NextResponse.json(
          { success: false, status: 'Invalid Base URL', error: 'Base URL must be a valid http or https URL' },
          { status: 400 }
        )
      );
    }

    const metadata: ProviderMetadata = {
      organizationId: body.organizationId || body.metadata?.organizationId,
      apiVersion: body.apiVersion || body.metadata?.apiVersion,
      customHeaders: body.customHeaders || body.metadata?.customHeaders,
      requestTimeoutMs: Number(body.requestTimeoutMs || body.metadata?.requestTimeoutMs || 20000),
      maxRetries: Number(body.maxRetries || body.metadata?.maxRetries || 1),
      temperature: body.temperature ?? body.metadata?.temperature,
      maxTokens: body.maxTokens ?? body.metadata?.maxTokens,
      streamingEnabled: body.streamingEnabled ?? body.metadata?.streamingEnabled ?? true,
    };

    const stored = body.id ? await DatabaseStore.getProvider(String(body.id), true) : null;
    const apiKey = String(body.apiKey || stored?.apiKey || '').trim();
    const provider: AIProvider = {
      id: body.id || stored?.id || 'unsaved-test',
      name: body.name || stored?.name || 'Unsaved Provider',
      type: option.id,
      protocol,
      baseUrl: baseUrl || stored?.baseUrl || '',
      apiKey,
      enabled: true,
      defaultModel: body.model || body.defaultModel || stored?.defaultModel || '',
      models: body.models || (body.model ? [body.model] : stored?.models || []),
      capabilities: body.capabilities || option.defaultCapabilities,
      connectionStatus: 'Untested',
      metadata,
    };

    if (!provider.apiKey) {
      return applyCorsHeaders(
        NextResponse.json(
          {
            success: false,
            status: 'Authentication Failed',
            error: 'API key is required. Paste the key, or Save Provider first and test the saved card.',
            reachable: false,
            authenticated: false,
          },
          { status: 400 }
        )
      );
    }

    const startTime = Date.now();
    const result = await ModelRouter.testConnection(provider);
    const latencyMs = Date.now() - startTime;

    return applyCorsHeaders(
      NextResponse.json({
        success: result.success,
        status: result.status,
        reachable: Boolean(result.reachable ?? result.success),
        authenticated: Boolean(result.authenticated ?? result.success),
        modelAvailable: Boolean(result.modelAvailable ?? result.success),
        models: result.models || [],
        latencyMs: result.success ? latencyMs : null,
        error: result.error ? sanitizeProviderError(result.error) : null,
      })
    );
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json(
        { success: false, error: sanitizeProviderError((err as Error).message || 'Failed to test provider') },
        { status: 500 }
      )
    );
  }
}
