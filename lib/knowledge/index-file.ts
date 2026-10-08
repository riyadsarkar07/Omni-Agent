import crypto from 'crypto';
import { DatabaseStore } from '../db/store';
import { readOwnedFile } from '../storage/user-files';
import { extractDocumentText, isExtractableMime } from './extract';
import { chunkText } from './chunk';
import { embedMany, getEmbeddingSupport } from './embed';

export async function indexOwnedFile(userId: string, fileId: string): Promise<{
  indexed: boolean;
  embeddingsUsed: boolean;
  chunkCount: number;
  reason?: string;
}> {
  const file = await DatabaseStore.getUserFile(fileId, userId);
  if (!file || !file.storage_path) {
    return { indexed: false, embeddingsUsed: false, chunkCount: 0, reason: 'File not found' };
  }
  if (!isExtractableMime(file.mime_type)) {
    await DatabaseStore.upsertKnowledgeDocument({
      id: file.id,
      user_id: userId,
      file_id: file.id,
      original_name: file.original_name,
      mime_type: file.mime_type,
      status: 'unsupported',
      chunk_count: 0,
      error_message: 'This file type cannot be indexed for RAG.',
    });
    return { indexed: false, embeddingsUsed: false, chunkCount: 0, reason: 'Unsupported file type' };
  }

  const bytes = await readOwnedFile(file.storage_path, userId);
  if (!bytes) {
    return { indexed: false, embeddingsUsed: false, chunkCount: 0, reason: 'File bytes not found' };
  }

  let text = '';
  try {
    text = await extractDocumentText(bytes, file.mime_type, file.original_name);
  } catch (err) {
    await DatabaseStore.upsertKnowledgeDocument({
      id: file.id,
      user_id: userId,
      file_id: file.id,
      original_name: file.original_name,
      mime_type: file.mime_type,
      status: 'failed',
      chunk_count: 0,
      error_message: (err as Error).message,
    });
    return { indexed: false, embeddingsUsed: false, chunkCount: 0, reason: (err as Error).message };
  }

  const chunks = chunkText(text).slice(0, 80);
  if (!chunks.length) {
    await DatabaseStore.upsertKnowledgeDocument({
      id: file.id,
      user_id: userId,
      file_id: file.id,
      original_name: file.original_name,
      mime_type: file.mime_type,
      status: 'failed',
      chunk_count: 0,
      error_message: 'No extractable text found in this file.',
    });
    return { indexed: false, embeddingsUsed: false, chunkCount: 0, reason: 'No extractable text' };
  }

  const support = await getEmbeddingSupport();
  let embeddingsUsed = false;
  let embedded: Array<{ content: string; embedding?: number[] | null; embedding_model?: string | null }> = chunks.map(
    (content) => ({ content, embedding: null, embedding_model: null })
  );

  if (support.supported) {
    const vectors = await embedMany(chunks);
    embeddingsUsed = vectors.some(Boolean);
    embedded = chunks.map((content, i) => ({
      content,
      embedding: vectors[i]?.embedding || null,
      embedding_model: vectors[i]?.model || null,
    }));
  }

  const documentId = file.id || crypto.randomUUID();
  await DatabaseStore.replaceKnowledgeChunks(userId, documentId, file.id, embedded);
  await DatabaseStore.upsertKnowledgeDocument({
    id: documentId,
    user_id: userId,
    file_id: file.id,
    original_name: file.original_name,
    mime_type: file.mime_type,
    status: 'ready',
    chunk_count: embedded.length,
    error_message: embeddingsUsed
      ? null
      : support.reason || 'Keyword retrieval is active because embeddings are unavailable.',
  });

  return {
    indexed: true,
    embeddingsUsed,
    chunkCount: embedded.length,
    reason: embeddingsUsed ? undefined : support.reason,
  };
}

export async function retrieveKnowledgeContext(
  userId: string,
  query: string,
  topK = 6
): Promise<{ context: string; hits: number; embeddingsUsed: boolean; limitation?: string }> {
  const support = await getEmbeddingSupport();
  let queryEmbedding: number[] | null = null;
  if (support.supported) {
    try {
      const { embedText } = await import('./embed');
      queryEmbedding = (await embedText(query)).embedding;
    } catch {
      queryEmbedding = null;
    }
  }
  const hits = await DatabaseStore.searchKnowledge(userId, query, queryEmbedding, topK);
  if (!hits.length) {
    return {
      context: '',
      hits: 0,
      embeddingsUsed: Boolean(queryEmbedding),
      limitation: support.supported ? undefined : support.reason,
    };
  }
  const context = hits
    .map(
      (hit, i) =>
        `[Source ${i + 1}: ${hit.original_name}]\n${hit.content}`
    )
    .join('\n\n');
  return {
    context,
    hits: hits.length,
    embeddingsUsed: Boolean(queryEmbedding),
    limitation: support.supported ? undefined : support.reason,
  };
}
