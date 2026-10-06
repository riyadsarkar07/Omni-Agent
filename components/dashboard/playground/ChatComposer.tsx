'use client';

import React, { useEffect, useRef } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating,
  disabled,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const canSend = !disabled && !isGenerating && value.trim().length > 0;

  return (
    <div className="shrink-0 border-t border-white/5 bg-zinc-950/90 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
      <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-zinc-900/70 px-2 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.25)] focus-within:border-cyan-500/30">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder="Ask OmniAgent anything..."
          aria-label="Message OmniAgent"
          disabled={disabled}
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 pl-2 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
        />
        {isGenerating ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generation"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300 transition-colors hover:bg-rose-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-zinc-950 transition-colors hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 disabled:pointer-events-none disabled:opacity-35"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
