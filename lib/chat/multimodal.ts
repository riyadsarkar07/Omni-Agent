import { z } from 'zod';
import { DatabaseStore } from '../db/store';
import { readOwnedFile } from '../storage/user-files';
import { extractDocumentText, isExtractableMime, KNOWLEDGE_MIME_TYPES } from '../knowledge/extract';
import { AIProvider } from '../providers/types';

export const chatRequestSchema = z.object({
  message: z.string().max(10000, 'Message exceeds 10,000 character limit').optional().default(''),
  agentId: z.string().optional(),
  conversationId: z.string().optional(),
  overrideModel: z.string().optional(),
  overrideProviderId: z.string().optional(),
  thinkingLevel: z.enum(['HIGH', 'LOW', 'MINIMAL', 'OFF']).optional(),
  attachmentIds: z.array(z.string().min(1).max(80)).max(8).optional(),
});

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;

export const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_ATTACHMENT_IDS = 8;
export const MAX_DOCUMENT_CHARS = 24000;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_CHAT_ATTACHMENTS_MESSAGE = 10000;

export interface ChatImagePart {
  type: 'image';
  mimeType: string;
  data: string;
  name: string;
  fileId: string;
}

export interface ChatDocumentPart {
  type: 'document';
  name: string;
  mimeType: string;
  text: string;
  fileId: string;
}

export interface PreparedChatInput {
  storedMessage: string;
  modelText: string;
  images: ChatImagePart[];
  documents: ChatDocumentPart[];
}

export interface VisionSuggestion {
  providerId: string;
  providerName: string;
  model: string;
}

export class CapabilityError extends Error {
  status = 400;
  code: string;
  suggested: VisionSuggestion[];

  constructor(message: string, code = 'VISION_UNSUPPORTED', suggested: VisionSuggestion[] = []) {
    super(message);
    this.name = 'CapabilityError';
    this.code = code;
    this.suggested = suggested;
  }
}

export function isImageMime(mime: string): boolean {
  return IMAGE_MIME_TYPES.has((mime || '').toLowerCase());
}

export function isDocumentMime(mime: string): boolean {
  return KNOWLEDGE_MIME_TYPES.has((mime || '').toLowerCase()) || isExtractableMime(mime);
}

export function modelLooksLikeVision(model?: string): boolean {
  const value = (model || '').toLowerCase();
  if (!value) return false;
  if (value.includes('gemini')) return true;
  if (/gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4-vision|gpt-5/.test(value)) return true;
  if (/claude-3|claude-4|claude-sonnet|claude-opus|claude-haiku/.test(value)) return true;
  if (/vision|vl-|llava|qwen.*vl|llama-4/.test(value)) return true;
  return false;
}

export function providerSupportsVision(
  provider?: Pick<AIProvider, 'capabilities' | 'protocol' | 'type'> | null,
  model?: string
): boolean {
  if (modelLooksLikeVision(model)) return true;
  if (!provider) return false;
  if ((provider.capabilities || []).includes('VISION')) return true;
  if (provider.protocol === 'gemini' || provider.type === 'gemini') return true;
  return false;
}

export function findVisionSuggestions(providers: AIProvider[], limit = 3): VisionSuggestion[] {
  const out: VisionSuggestion[] = [];
  for (const provider of providers) {
    if (!provider.enabled) continue;
    const model =
      (provider.models || []).find((id) => modelLooksLikeVision(id)) ||
      (providerSupportsVision(provider, provider.defaultModel) ? provider.defaultModel : '');
    if (!model) continue;
    if (!providerSupportsVision(provider, model) && !modelLooksLikeVision(model)) continue;
    out.push({
      providerId: provider.id,
      providerName: provider.name,
      model,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function composeStoredUserMessage(message: string, names: string[]): string {
  const trimmed = (message || '').trim();
  if (!names.length) return trimmed;
  const label = `[Attached: ${names.join(', ')}]`;
  return trimmed ? `${trimmed}\n\n${label}` : label;
}

export function composeModelText(message: string, documents: ChatDocumentPart[]): string {
  const trimmed = (message || '').trim();
  const fallback =
    documents.length > 1
      ? 'Analyze and compare the attached documents. Summarize, extract key information, and answer any question.'
      : documents.length === 1
        ? 'Analyze the attached document. Summarize it, extract key information, and answer any question.'
        : 'Please analyze the attached image(s).';
  const base = trimmed || fallback;
  if (!documents.length) return base;

  let remaining = MAX_DOCUMENT_CHARS;
  const blocks: string[] = [];
  for (let i = 0; i < documents.length; i += 1) {
    if (remaining <= 0) {
      blocks.push(`[Document ${i + 1}: ${documents[i].name}]\n[Truncated: context limit reached]`);
      continue;
    }
    const text = documents[i].text.slice(0, remaining);
    remaining -= text.length;
    const more = documents[i].text.length > text.length ? '\n[Truncated]' : '';
    blocks.push(`[Document ${i + 1}: ${documents[i].name}]\n${text}${more}`);
  }
  return `${base}\n\nAttached documents (private, owner-scoped). Use only this extracted text; do not invent missing pages.\n\n${blocks.join('\n\n')}`;
}

export async function prepareChatInput(params: {
  userId?: string;
  message: string;
  attachmentIds?: string[];
}): Promise<PreparedChatInput> {
  const ids = Array.from(new Set((params.attachmentIds || []).filter(Boolean))).slice(0, MAX_ATTACHMENT_IDS);
  const message = (params.message || '').trim();

  if (!ids.length) {
    return {
      storedMessage: message,
      modelText: message,
      images: [],
      documents: [],
    };
  }

  if (!params.userId) {
    throw new CapabilityError(
      'File attachments require a signed-in user session.',
      'ATTACHMENTS_REQUIRE_SESSION'
    );
  }

  const images: ChatImagePart[] = [];
  const documents: ChatDocumentPart[] = [];
  const names: string[] = [];

  for (const id of ids) {
    const file = await DatabaseStore.getUserFile(id, params.userId);
    if (!file || !file.storage_path) {
      throw new CapabilityError('Attachment not found or not owned by this user.', 'ATTACHMENT_NOT_FOUND');
    }
    const bytes = await readOwnedFile(file.storage_path, params.userId);
    if (!bytes) {
      throw new CapabilityError(`Could not read attached file: ${file.original_name}`, 'ATTACHMENT_UNREADABLE');
    }
    names.push(file.original_name);
    const mime = (file.mime_type || '').toLowerCase();

    if (isImageMime(mime)) {
      if (bytes.length > MAX_IMAGE_BYTES) {
        throw new CapabilityError(
          `Image ${file.original_name} exceeds the ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB vision limit.`,
          'ATTACHMENT_TOO_LARGE'
        );
      }
      images.push({
        type: 'image',
        mimeType: mime,
        data: bytes.toString('base64'),
        name: file.original_name,
        fileId: file.id,
      });
      continue;
    }

    if (isDocumentMime(mime)) {
      try {
        const text = await extractDocumentText(bytes, mime, file.original_name);
        documents.push({
          type: 'document',
          name: file.original_name,
          mimeType: mime,
          text: text || '[No extractable text found in this document.]',
          fileId: file.id,
        });
      } catch (err) {
        documents.push({
          type: 'document',
          name: file.original_name,
          mimeType: mime,
          text: `[Could not extract text: ${(err as Error).message}]`,
          fileId: file.id,
        });
      }
      continue;
    }

    throw new CapabilityError(`Unsupported attachment type: ${file.original_name}`, 'ATTACHMENT_TYPE');
  }

  const storedMessage = composeStoredUserMessage(message, names);
  const modelText = composeModelText(message, documents);
  return { storedMessage, modelText, images, documents };
}

export function visionUnsupportedMessage(model: string, suggested: VisionSuggestion[]): string {
  const hint = suggested.length
    ? ` Compatible options: ${suggested.map((s) => `${s.providerName} / ${s.model}`).join(', ')}.`
    : ' Configure a vision-capable provider such as Google Gemini, OpenAI GPT-4o, or Anthropic Claude.';
  return `The selected model (${model || 'current'}) does not support image input. The image was not sent and was not analyzed.${hint}`;
}
