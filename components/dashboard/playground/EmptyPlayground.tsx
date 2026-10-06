'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';

const PROMPTS: { label: string; prompt: string }[] = [
  { label: 'Write Code', prompt: 'Write a clean TypeScript function with tests for a rate-limited API client.' },
  { label: 'Analyze', prompt: 'Analyze this architecture for bottlenecks and security gaps in a multi-tenant AI gateway.' },
  { label: 'Research', prompt: 'Summarize current best practices for routing requests across multiple third-party AI providers.' },
  { label: 'Create Content', prompt: 'Draft a concise product update announcing OmniAgent as a personal AI command center.' },
];

export const EmptyPlayground: React.FC<{
  onPrompt: (prompt: string) => void;
}> = ({ onPrompt }) => {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-4 py-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 shadow-[0_0_24px_rgba(34,211,238,0.12)]">
        <Sparkles className="h-5 w-5 text-cyan-300" />
      </div>
      <h3 className="text-base font-semibold tracking-tight text-zinc-50">OmniAgent</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-zinc-400">
        Your personal AI command center.
      </p>
      <div className="mt-5 grid w-full max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
        {PROMPTS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onPrompt(item.prompt)}
            className="min-h-11 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-zinc-200 transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};
