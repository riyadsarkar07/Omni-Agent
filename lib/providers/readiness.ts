import { OpenAIAdapter } from './adapters';
import { joinProviderUrl } from './catalog';
import { classifyProviderNetworkError, isCloudRuntime, validateProviderEndpoint } from './endpoint';
import { sanitizeProviderError } from './secrets';
import type { AIProvider, ConnectionTestResult, ReadinessCheck } from './types';

function failedResult(
  checks: ReadinessCheck[],
  status: ConnectionTestResult['status'],
  error: string,
  extras?: Partial<ConnectionTestResult>
): ConnectionTestResult {
  return {
    success: false,
    status,
    error: sanitizeProviderError(error),
    reachable: extras?.reachable ?? false,
    authenticated: extras?.authenticated ?? false,
    modelAvailable: extras?.modelAvailable ?? false,
    models: extras?.models || [],
    kind: extras?.kind,
    chatVerified: false,
    streamingVerified: false,
    checks,
  };
}

async function consumeStream(stream: ReadableStream<Uint8Array>): Promise<{ text: string; sawError: string | null }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let sawError: string | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as { type?: string; text?: string; error?: string };
          if (parsed.type === 'error') {
            sawError = parsed.error || 'Stream processing failed';
          } else if (parsed.text) {
            text += parsed.text;
          }
        } catch {
          // ignore keep-alives
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { text, sawError };
}

export async function runOpenAICompatibleReadiness(provider: AIProvider): Promise<ConnectionTestResult> {
  const checks: ReadinessCheck[] = [];
  const baseUrl = OpenAIAdapter.resolveBaseUrl(provider);
  const endpoint = validateProviderEndpoint(baseUrl || provider.baseUrl || '');
  checks.push({
    id: 'endpoint',
    label: isCloudRuntime()
      ? 'Public HTTPS OmniRoute endpoint is valid for this Vercel runtime'
      : 'OmniRoute Base URL is valid for this runtime',
    passed: endpoint.ok,
    detail: endpoint.ok
      ? `Using ${endpoint.normalized}. Localhost is not rewritten to a public URL.`
      : endpoint.error,
    kind: endpoint.kind,
  });
  if (!endpoint.ok) {
    return failedResult(checks, endpoint.status, endpoint.error || 'Invalid Base URL', { kind: endpoint.kind });
  }

  const modelsTest = await OpenAIAdapter.testConnection(provider);
  const modelsOk = Boolean(modelsTest.success && modelsTest.reachable && modelsTest.authenticated);
  checks.push({
    id: 'models',
    label: `GET ${joinProviderUrl(baseUrl, '/models')} with Bearer API key`,
    passed: modelsOk,
    detail: modelsOk
      ? `Listed ${(modelsTest.models || []).length} model(s).`
      : modelsTest.error || 'GET /v1/models did not succeed.',
    kind: modelsTest.kind,
  });
  if (!modelsOk) {
    return {
      ...modelsTest,
      success: false,
      error: sanitizeProviderError(modelsTest.error || 'GET /v1/models did not succeed.'),
      chatVerified: false,
      streamingVerified: false,
      checks,
    };
  }

  const model = provider.defaultModel || modelsTest.models?.[0] || '';
  let chatVerified = false;
  let chatError = '';
  let chatKind = 'ok';
  if (!model) {
    checks.push({
      id: 'chat',
      label: 'Chat completion through the OpenAI-compatible provider router',
      passed: false,
      detail: 'A Model ID is required before a real chat completion can be verified.',
      kind: 'http',
    });
    return failedResult(checks, 'Configuration Error', 'A Model ID is required before a real chat completion can be verified.', {
      reachable: true,
      authenticated: true,
      models: modelsTest.models,
      kind: 'http',
    });
  }

  try {
    const generated = await OpenAIAdapter.generate(provider, {
      model,
      messages: [{ role: 'user', content: 'ping' }],
      maxOutputTokens: 8,
      stream: false,
    });
    chatVerified = Boolean(generated && typeof generated.text === 'string');
    if (!chatVerified) {
      chatError = 'Chat completion returned an empty response.';
    }
  } catch (err: unknown) {
    const classified = classifyProviderNetworkError(err, joinProviderUrl(baseUrl, '/chat/completions'), OpenAIAdapter.timeoutMs(provider));
    chatKind = classified.kind;
    chatError = sanitizeProviderError(classified.error || (err as Error).message || 'Chat completion failed');
  }

  checks.push({
    id: 'chat',
    label: `POST ${joinProviderUrl(baseUrl, '/chat/completions')}`,
    passed: chatVerified,
    detail: chatVerified ? `Chat completion succeeded for model '${model}'.` : chatError,
    kind: chatVerified ? 'ok' : chatKind,
  });

  if (!chatVerified) {
    return failedResult(checks, 'Provider Unavailable', chatError || 'Chat completion was not verified.', {
      reachable: true,
      authenticated: true,
      modelAvailable: modelsTest.modelAvailable,
      models: modelsTest.models,
      kind: chatKind,
    });
  }

  const streamingRequested = provider.capabilities?.includes('STREAMING') && provider.metadata?.streamingEnabled !== false;
  let streamingVerified = false;
  let streamDetail = 'Streaming was not requested for this provider.';
  if (!streamingRequested) {
    checks.push({
      id: 'stream',
      label: 'SSE chat streaming',
      passed: true,
      skipped: true,
      detail: streamDetail,
      kind: 'ok',
    });
  } else {
    try {
      const stream = await OpenAIAdapter.generateStream(provider, {
        model,
        messages: [{ role: 'user', content: 'ping' }],
        maxOutputTokens: 8,
        stream: true,
      });
      const consumed = await consumeStream(stream);
      if (consumed.sawError) {
        streamDetail = sanitizeProviderError(consumed.sawError);
      } else {
        streamingVerified = true;
        streamDetail = consumed.text
          ? 'Streaming SSE chunks were received.'
          : 'Streaming request completed without an error.';
      }
    } catch (err: unknown) {
      const classified = classifyProviderNetworkError(err, joinProviderUrl(baseUrl, '/chat/completions'), OpenAIAdapter.timeoutMs(provider));
      streamDetail = sanitizeProviderError(classified.error || (err as Error).message || 'Streaming request failed');
      checks.push({
        id: 'stream',
        label: `POST ${joinProviderUrl(baseUrl, '/chat/completions')} (stream)`,
        passed: false,
        detail: streamDetail,
        kind: classified.kind,
      });
      return {
        success: true,
        status: 'Connected',
        reachable: true,
        authenticated: true,
        modelAvailable: true,
        models: modelsTest.models,
        chatVerified: true,
        streamingVerified: false,
        kind: 'ok',
        error: `Chat completion succeeded. Streaming was not verified: ${streamDetail}`,
        checks,
      };
    }
    checks.push({
      id: 'stream',
      label: `POST ${joinProviderUrl(baseUrl, '/chat/completions')} (stream)`,
      passed: streamingVerified,
      detail: streamDetail,
      kind: streamingVerified ? 'ok' : 'http',
    });
  }

  return {
    success: true,
    status: 'Connected',
    reachable: true,
    authenticated: true,
    modelAvailable: true,
    models: modelsTest.models,
    chatVerified: true,
    streamingVerified: streamingRequested ? streamingVerified : undefined,
    kind: 'ok',
    error: streamingRequested && !streamingVerified ? streamDetail : undefined,
    checks,
  };
}
