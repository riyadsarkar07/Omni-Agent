import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { GeminiModelId } from './types';

function requireGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim() || '';
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured. Use a saved OpenAI-compatible provider, or add GEMINI_API_KEY in Vercel.');
  }
  return key;
}

function createGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: requireGeminiKey(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop) {
    const client = createGeminiClient() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export { ThinkingLevel };

export interface ModelMetadata {
  id: GeminiModelId;
  name: string;
  tagline: string;
  badge: string;
  description: string;
  supportsThinking: boolean;
  recommendedFor: string[];
}

export const AVAILABLE_MODELS: ModelMetadata[] = [
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    tagline: 'High Speed & Balanced Intelligence',
    badge: 'Standard Workhorse',
    description: 'Next-generation workhorse model with high speed, strong reasoning, and multimodal capabilities.',
    supportsThinking: false,
    recommendedFor: ['General Assistants', 'Customer Support', 'Conversational Agents', 'Content Generation'],
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro (Preview)',
    tagline: 'Maximum Reasoning & High Thinking',
    badge: 'Pro Reasoning',
    description: 'Flagship reasoning model supporting ThinkingLevel.HIGH for complex multi-step reasoning, math, and code architecture.',
    supportsThinking: true,
    recommendedFor: ['Complex Coding', 'Scientific / Math Reasoning', 'Deep Strategy', 'Multi-step Planning'],
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash Lite',
    tagline: 'Ultra-low Latency & Efficiency',
    badge: 'Ultra Fast',
    description: 'Cost-optimized, ultra-low latency model engineered for real-time streaming and high-volume throughput.',
    supportsThinking: false,
    recommendedFor: ['Real-time Autocomplete', 'Fast Classification', 'Summarization', 'High-volume APIs'],
  },
  {
    id: 'gemini-flash-latest',
    name: 'Gemini Flash (Latest Alias)',
    tagline: 'Auto-updating Fast Flash Model',
    badge: 'Latest Auto-alias',
    description: 'Always points to the latest stable production Gemini Flash release.',
    supportsThinking: false,
    recommendedFor: ['Quick QA', 'Standard Chatbots', 'Automated Workflows'],
  },
];
