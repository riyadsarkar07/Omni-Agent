import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  composeModelText,
  composeStoredUserMessage,
  findVisionSuggestions,
  isDocumentMime,
  isImageMime,
  modelLooksLikeVision,
  providerSupportsVision,
  visionUnsupportedMessage,
} from './multimodal';
import { buildNormalizedUserMessage, toAnthropicContent, toGeminiParts, toOpenAIContent } from './provider-content';
import { AIProvider } from '../providers/types';

describe('multimodal helpers', () => {
  it('classifies image and document MIME types', () => {
    assert.equal(isImageMime('image/png'), true);
    assert.equal(isImageMime('image/jpeg'), true);
    assert.equal(isImageMime('image/webp'), true);
    assert.equal(isImageMime('application/pdf'), false);
    assert.equal(isDocumentMime('application/pdf'), true);
    assert.equal(isDocumentMime('text/markdown'), true);
    assert.equal(isDocumentMime('image/png'), false);
  });

  it('detects vision-capable models without pretending text-only models can see', () => {
    assert.equal(modelLooksLikeVision('gemini-3.5-flash'), true);
    assert.equal(modelLooksLikeVision('gpt-4o'), true);
    assert.equal(modelLooksLikeVision('claude-3-5-sonnet'), true);
    assert.equal(modelLooksLikeVision('gpt-3.5-turbo'), false);
    assert.equal(
      providerSupportsVision({ capabilities: ['TEXT'], protocol: 'openai', type: 'openai-compatible' }, 'llama-3-8b'),
      false
    );
    assert.equal(
      providerSupportsVision({ capabilities: ['TEXT', 'VISION'], protocol: 'openai', type: 'openai' }, 'custom-model'),
      true
    );
  });

  it('composes stored labels without dumping extracted document text into history', () => {
    assert.equal(composeStoredUserMessage('Hello', ['a.png']), 'Hello\n\n[Attached: a.png]');
    assert.equal(composeStoredUserMessage('', ['notes.pdf']), '[Attached: notes.pdf]');
  });

  it('includes extracted document text in the model prompt and truncates long text', () => {
    const text = composeModelText('Summarize this', [
      { type: 'document', name: 'a.txt', mimeType: 'text/plain', text: 'Alpha', fileId: '1' },
      { type: 'document', name: 'b.txt', mimeType: 'text/plain', text: 'Beta', fileId: '2' },
    ]);
    assert.match(text, /Summarize this/);
    assert.match(text, /Document 1: a.txt/);
    assert.match(text, /Alpha/);
    assert.match(text, /Beta/);
  });

  it('builds provider-native image payloads and never uses a public file URL', () => {
    const message = buildNormalizedUserMessage('Describe this image.', [
      { type: 'image', mimeType: 'image/png', data: 'abc123', name: 'shot.png', fileId: 'f1' },
    ]);
    const gemini = toGeminiParts(message);
    assert.deepEqual(gemini[0], { text: 'Describe this image.' });
    assert.deepEqual(gemini[1], { inlineData: { mimeType: 'image/png', data: 'abc123' } });

    const openai = toOpenAIContent(message);
    assert.ok(Array.isArray(openai));
    const imagePart = (openai as Array<Record<string, unknown>>)[1] as {
      image_url: { url: string };
    };
    assert.equal(imagePart.image_url.url.startsWith('data:image/png;base64,'), true);
    assert.equal(imagePart.image_url.url.includes('supabase'), false);

    const anthropic = toAnthropicContent(message);
    assert.ok(Array.isArray(anthropic));
    const src = (anthropic as Array<{ source?: { data: string } }>)[1];
    assert.equal(src.source?.data, 'abc123');
  });

  it('suggests vision providers and explains when a model cannot see images', () => {
    const providers: AIProvider[] = [
      {
        id: 'text-only',
        name: 'Local Llama',
        type: 'openai-compatible',
        protocol: 'openai',
        baseUrl: 'http://localhost:11434/v1',
        enabled: true,
        defaultModel: 'llama-3-8b',
        models: ['llama-3-8b'],
        capabilities: ['TEXT'],
        connectionStatus: 'Connected',
      },
      {
        id: 'gemini',
        name: 'Google Gemini',
        type: 'gemini',
        protocol: 'gemini',
        baseUrl: '',
        enabled: true,
        defaultModel: 'gemini-3.5-flash',
        models: ['gemini-3.5-flash'],
        capabilities: ['TEXT', 'VISION'],
        connectionStatus: 'Connected',
      },
    ];
    const suggested = findVisionSuggestions(providers);
    assert.equal(suggested[0]?.providerId, 'gemini');
    const msg = visionUnsupportedMessage('llama-3-8b', suggested);
    assert.match(msg, /does not support image input/);
    assert.match(msg, /was not sent and was not analyzed/);
    assert.match(msg, /Google Gemini \/ gemini-3.5-flash/);
  });
});
