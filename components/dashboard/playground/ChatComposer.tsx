'use client';

import React, { useEffect, useRef } from 'react';
import { ArrowUp, AudioLines, Mic, Paperclip, Square } from 'lucide-react';
import { AttachmentPreview, PendingAttachment } from './AttachmentPreview';
import { SpeechSupport } from '@/hooks/useSpeechRecognition';

const ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.markdown,.docx,image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  disabled?: boolean;
  attachments: PendingAttachment[];
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  onRetryAttachment?: (id: string) => void;
  voiceListening: boolean;
  voiceSupport: SpeechSupport;
  voiceError: string | null;
  interimTranscript?: string;
  onToggleVoice: () => void;
  onOpenVoiceMode: () => void;
  visionSupported?: boolean;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isGenerating,
  disabled,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onRetryAttachment,
  voiceListening,
  voiceSupport,
  voiceError,
  interimTranscript,
  onToggleVoice,
  onOpenVoiceMode,
  visionSupported = true,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const readyAttachments = attachments.filter((a) => a.status === 'ready' && a.fileId);
  const uploading = attachments.some((a) => a.status === 'uploading' || a.status === 'pending');
  const canSend =
    !disabled &&
    !isGenerating &&
    !uploading &&
    (value.trim().length > 0 || readyAttachments.length > 0);

  const takeFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    onAddFiles(Array.from(list));
  };

  return (
    <div className="shrink-0 border-t border-white/5 bg-zinc-950/90 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:px-4">
      <div
        className={`rounded-2xl border bg-zinc-900/70 px-2 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.25)] focus-within:border-cyan-500/30 ${
          dragOver ? 'border-cyan-400/60' : 'border-white/10'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          takeFiles(e.dataTransfer.files);
        }}
      >
        <AttachmentPreview
          files={attachments}
          onRemove={onRemoveAttachment}
          onRetry={onRetryAttachment}
          visionSupported={visionSupported}
        />
        {interimTranscript ? (
          <div className="px-2 pb-1 text-[11px] text-cyan-200/80">Listening: {interimTranscript}</div>
        ) : null}
        {voiceError ? <div className="px-2 pb-1 text-[11px] text-amber-300/90">{voiceError}</div> : null}
        <div className="flex items-end gap-1.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              takeFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            aria-label="Attach files"
            disabled={disabled || isGenerating}
            onClick={() => fileRef.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/5 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.items)
                .filter((item) => item.kind === 'file')
                .map((item) => item.getAsFile())
                .filter((file): file is File => Boolean(file));
              if (files.length) {
                e.preventDefault();
                onAddFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) onSend();
              }
            }}
            placeholder={voiceListening ? 'Listening...' : 'Ask OmniAgent anything...'}
            aria-label="Message OmniAgent"
            disabled={disabled}
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 pl-1 text-[15px] leading-6 text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            aria-label={voiceListening ? 'Stop voice input' : 'Start voice input'}
            disabled={disabled || voiceSupport === 'none'}
            onClick={onToggleVoice}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 disabled:opacity-40 ${
              voiceListening ? 'bg-rose-500/20 text-rose-300' : 'text-zinc-400 hover:bg-white/5 hover:text-cyan-200'
            }`}
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Start voice conversation"
            disabled={disabled || isGenerating}
            onClick={onOpenVoiceMode}
            className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-white/5 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 disabled:opacity-40 sm:flex"
          >
            <AudioLines className="h-4 w-4" />
          </button>
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
        <div className="mt-1 flex items-center justify-between px-1">
          <p className="text-[10px] text-zinc-600">
            {voiceSupport === 'none'
              ? 'Voice input is not supported in this browser.'
              : voiceSupport === 'server'
                ? 'Browser speech recognition is unavailable. Microphone uses server transcription.'
                : 'Images, PDF, TXT, Markdown, DOCX. Drag, paste, or attach.'}
          </p>
          <button
            type="button"
            onClick={onOpenVoiceMode}
            className="min-h-8 rounded-lg px-2 text-[11px] text-zinc-400 hover:text-cyan-200 sm:hidden"
          >
            Voice chat
          </button>
        </div>
      </div>
    </div>
  );
};
