'use client';

import React, { useState } from 'react';
import { Bot, Check, Copy, Pencil, RefreshCw, Square, User } from 'lucide-react';
import { PlaygroundMessage } from './types';
import { MarkdownMessage } from './markdown';
import { ResponseMetadata } from './ResponseMetadata';
import { ToolExecution } from './ToolExecution';

interface ChatMessageProps {
  message: PlaygroundMessage;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onEditResend?: (text: string) => void;
  onStop?: () => void;
  isLastModel: boolean;
  isGenerating: boolean;
}

export const ChatMessageBubble: React.FC<ChatMessageProps> = ({
  message,
  onCopy,
  copiedId,
  onRegenerate,
  onRetry,
  onEditResend,
  onStop,
  isLastModel,
  isGenerating,
}) => {
  const isUser = message.role === 'user';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.text);

  return (
    <div className={`flex min-w-0 gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-200">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div
        className={`min-w-0 max-w-[min(100%,36rem)] rounded-2xl px-3.5 py-3 sm:max-w-[75%] ${
          isUser
            ? 'rounded-tr-md bg-zinc-100 text-zinc-950'
            : 'rounded-tl-md border border-white/5 bg-zinc-800/80 text-zinc-100'
        }`}
      >
        {isUser ? (
          editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full min-h-20 rounded-lg border border-zinc-300 bg-white p-2 text-[13px] text-zinc-900 focus:outline-none"
                aria-label="Edit message"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = draft.trim();
                    if (!next) return;
                    setEditing(false);
                    onEditResend?.(next);
                  }}
                  className="min-h-9 rounded-lg bg-zinc-950 px-3 text-[11px] font-semibold text-white"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(message.text);
                    setEditing(false);
                  }}
                  className="min-h-9 rounded-lg px-3 text-[11px] text-zinc-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{message.text}</div>
          )
        ) : (
          <>
            {message.toolCalls && message.toolCalls.length > 0 && (
              <ToolExecution toolCalls={message.toolCalls} />
            )}
            <MarkdownMessage text={message.text || (message.isStreaming ? '' : '')} />
            {message.isStreaming && !message.text && (
              <div className="flex items-center gap-2 text-[12px] text-zinc-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                Generating...
              </div>
            )}
            <ResponseMetadata message={message} generating={message.isStreaming} />
          </>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1">
          {!isUser && message.text && (
            <button
              type="button"
              aria-label="Copy response"
              onClick={() => onCopy(message.text, message.id)}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] text-zinc-400 hover:bg-white/5 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
            >
              {copiedId === message.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </button>
          )}
          {isUser && onEditResend && !isGenerating && (
            <button
              type="button"
              aria-label="Edit and resend"
              onClick={() => {
                setDraft(message.text);
                setEditing(true);
              }}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          )}
          {!isUser && isLastModel && isGenerating && onStop && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] text-rose-300 hover:bg-rose-500/10"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </button>
          )}
          {!isUser && isLastModel && !isGenerating && onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          )}
          {!isUser && isLastModel && !isGenerating && onRetry && message.text.length === 0 && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] text-zinc-400 hover:bg-white/5"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      </div>

      {isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-700 text-zinc-200">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
};
