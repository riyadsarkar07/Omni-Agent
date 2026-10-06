'use client';

import React from 'react';
import { CheckCircle2, Gauge } from 'lucide-react';
import { PlaygroundMessage } from './types';

export const ResponseMetadata: React.FC<{
  message: PlaygroundMessage;
  generating?: boolean;
}> = ({ message, generating }) => {
  if (generating || message.isStreaming) {
    return (
      <div className="flex items-center gap-2 pt-2 text-[10px] text-cyan-300/90">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
        Generating...
      </div>
    );
  }

  const parts: string[] = [];
  if (typeof message.latencyMs === 'number' && Number.isFinite(message.latencyMs)) {
    parts.push(`${message.latencyMs}ms`);
  }
  if (typeof message.tokens === 'number' && Number.isFinite(message.tokens) && message.tokens > 0) {
    parts.push(`${message.tokens} tokens`);
  }
  if (message.provider) parts.push(message.provider);
  if (message.model) parts.push(message.model);

  if (parts.length === 0 && !message.stopped) return null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-2 text-[10px] text-zinc-500">
      {message.stopped ? (
        <span className="text-amber-400/90">Stopped</span>
      ) : (
        <span className="inline-flex items-center gap-1 text-emerald-400/90">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </span>
      )}
      {parts.map((part) => (
        <span key={part} className="inline-flex min-w-0 max-w-full items-center gap-1 truncate">
          <Gauge className="h-3 w-3 shrink-0 text-zinc-600" />
          <span className="truncate">{part}</span>
        </span>
      ))}
    </div>
  );
};
