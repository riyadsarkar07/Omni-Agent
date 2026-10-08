import { getSupabaseAdmin } from '../db/supabase';
import { ModelRouter } from '../providers/router';
import { fetchWithTimeout, buildProviderHeaders } from '../providers/http';
import { joinProviderUrl } from '../providers/catalog';
import { AIProvider } from '../providers/types';

export interface EmbeddingResult {
  embedding: number[];
  model: string;
}

export interface EmbeddingSupport {
  supported: boolean;
  reason?: string;
  providerId?: string;
  model?: string;
}

function hasGeminiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export async function getEmbeddingSupport(): Promise<EmbeddingSupport> {
  if (hasGeminiKey()) {
    return { supported: true, providerId: 'gemini', model: 'text-embedding-004' };
  }
  try {
    const providers = await ModelRouter.resolveProvider();
    if (providers.protocol === 'openai' && providers.enabled && providers.apiKey) {
      return {
        supported: true,
        providerId: providers.id,
        model: 'text-embedding-3-small',
      };
    }
  } catch {
    //
  }
  try {
    const listed = await (await import('../db/store')).DatabaseStore.listProviders(true);
    const openaiLike = listed.find(
      (p) => p.enabled && p.protocol === 'openai' && Boolean(p.apiKey)
    );
    if (openaiLike) {
      return { supported: true, providerId: openaiLike.id, model: 'text-embedding-3-small' };
    }
  } catch {
    //
  }
  return {
    supported: false,
    reason:
      'No embedding-capable provider is configured. Set GEMINI_API_KEY or save an OpenAI-compatible provider with embeddings support.',
  };
}

async function embedWithGemini(text: string): Promise<EmbeddingResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: key });
  const response = await ai.models.embedContent({
    model: 'text-embedding-004',
    contents: text,
  });
  const values =
    (response as { embeddings?: Array<{ values?: number[] }>; embedding?: { values?: number[] } }).embeddings?.[0]
      ?.values ||
    (response as { embedding?: { values?: number[] } }).embedding?.values ||
    [];
  if (!values.length) {
    throw new Error('Gemini embedding response was empty');
  }
  return { embedding: values, model: 'text-embedding-004' };
}

async function embedWithOpenAI(provider: AIProvider, text: string): Promise<EmbeddingResult> {
  const url = joinProviderUrl(provider.baseUrl || 'https://api.openai.com/v1', '/embeddings');
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: buildProviderHeaders(provider),
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text.slice(0, 8000),
      }),
    },
    provider.metadata?.requestTimeoutMs || 20000
  );
  if (!res.ok) {
    throw new Error(`Embedding provider returned ${res.status}`);
  }
  const body = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const values = body.data?.[0]?.embedding;
  if (!values?.length) throw new Error('OpenAI embedding response was empty');
  return { embedding: values, model: 'text-embedding-3-small' };
}

export async function embedText(text: string): Promise<EmbeddingResult> {
  const support = await getEmbeddingSupport();
  if (!support.supported) {
    throw new Error(support.reason || 'Embeddings are not supported');
  }
  const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, 8000);
  if (!trimmed) throw new Error('Cannot embed empty text');
  if (support.providerId === 'gemini' || hasGeminiKey()) {
    return embedWithGemini(trimmed);
  }
  const provider = await ModelRouter.resolveProvider(support.providerId);
  return embedWithOpenAI(provider, trimmed);
}

export async function embedMany(texts: string[]): Promise<Array<EmbeddingResult | null>> {
  const results: Array<EmbeddingResult | null> = [];
  for (const text of texts) {
    try {
      results.push(await embedText(text));
    } catch {
      results.push(null);
    }
  }
  return results;
}

export function embeddingsConfigured(): boolean {
  return hasGeminiKey() || Boolean(getSupabaseAdmin());
}
