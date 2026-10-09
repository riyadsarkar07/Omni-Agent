import { NormalizedMessage } from '../providers/types';
import { ChatImagePart } from './multimodal';

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export function toGeminiParts(message: NormalizedMessage): GeminiPart[] {
  const parts: GeminiPart[] = [];
  if (message.parts && message.parts.length > 0) {
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) parts.push({ text: part.text });
      if (part.type === 'image' && part.data && part.mimeType) {
        parts.push({ inlineData: { mimeType: part.mimeType, data: part.data } });
      }
    }
  }
  if (!parts.length && message.content) {
    parts.push({ text: message.content });
  }
  return parts;
}

export function geminiUserPartsFromText(
  text: string,
  images: ChatImagePart[]
): GeminiPart[] {
  const parts: GeminiPart[] = [];
  if (text) parts.push({ text });
  for (const image of images) {
    parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }
  if (!parts.length) parts.push({ text: '' });
  return parts;
}

export function toOpenAIContent(message: NormalizedMessage): string | Array<Record<string, unknown>> {
  const images = (message.parts || []).filter((part) => part.type === 'image');
  if (!images.length) return message.content;
  const text =
    (message.parts || [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim() || message.content;
  const content: Array<Record<string, unknown>> = [];
  if (text) content.push({ type: 'text', text });
  for (const image of images) {
    if (!image.mimeType || !image.data) continue;
    content.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    });
  }
  return content;
}

export function toAnthropicContent(message: NormalizedMessage): string | Array<Record<string, unknown>> {
  const images = (message.parts || []).filter((part) => part.type === 'image');
  if (!images.length) return message.content;
  const text =
    (message.parts || [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim() || message.content;
  const content: Array<Record<string, unknown>> = [];
  if (text) content.push({ type: 'text', text });
  for (const image of images) {
    if (!image.mimeType || !image.data) continue;
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mimeType,
        data: image.data,
      },
    });
  }
  return content;
}

export function messageHasImages(message: NormalizedMessage): boolean {
  return Boolean(message.parts?.some((part) => part.type === 'image'));
}

export function buildNormalizedUserMessage(text: string, images: ChatImagePart[]): NormalizedMessage {
  const parts: NormalizedMessage['parts'] = [];
  if (text) parts.push({ type: 'text', text });
  for (const image of images) {
    parts.push({ type: 'image', mimeType: image.mimeType, data: image.data });
  }
  return {
    role: 'user',
    content: text,
    parts: parts.length ? parts : undefined,
  };
}
