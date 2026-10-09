'use client';

import React from 'react';
import { FileText, Image as ImageIcon, Loader2, RotateCcw, X } from 'lucide-react';

export type AttachmentStatus = 'pending' | 'uploading' | 'ready' | 'error';

export interface PendingAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
  fileId?: string;
  status: AttachmentStatus;
  progress: number;
  error?: string;
  file?: File;
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export const AttachmentPreview: React.FC<{
  files: PendingAttachment[];
  onRemove: (id: string) => void;
  onRetry?: (id: string) => void;
  visionSupported?: boolean;
}> = ({ files, onRemove, onRetry, visionSupported = true }) => {
  if (!files.length) return null;

  const hasImages = files.some((file) => file.type.startsWith('image/'));

  return (
    <div className="space-y-2 px-1 pb-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {files.map((file) => (
          <div
            key={file.id}
            className="relative flex min-w-[150px] max-w-[200px] items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/80 p-2"
          >
            {file.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.previewUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
            ) : file.type.startsWith('image/') ? (
              <ImageIcon className="h-5 w-5 shrink-0 text-cyan-300" />
            ) : (
              <FileText className="h-5 w-5 shrink-0 text-zinc-400" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-zinc-200">{file.name}</div>
              <div className="text-[10px] text-zinc-500">
                {file.status === 'uploading'
                  ? `Uploading ${file.progress}%`
                  : file.status === 'error'
                    ? file.error || 'Upload failed'
                    : formatSize(file.size)}
              </div>
              {file.status === 'uploading' && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-cyan-400" style={{ width: `${Math.max(8, file.progress)}%` }} />
                </div>
              )}
            </div>
            {file.status === 'uploading' && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan-300" />
            )}
            {file.status === 'error' && onRetry && (
              <button
                type="button"
                aria-label={`Retry ${file.name}`}
                onClick={() => onRetry(file.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-amber-300 hover:bg-white/5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              aria-label={`Remove ${file.name}`}
              onClick={() => onRemove(file.id)}
              className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-zinc-950 text-zinc-400 hover:text-rose-300"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      {hasImages && !visionSupported && (
        <p className="text-[11px] leading-relaxed text-amber-300/90">
          The selected model does not support image input. Switch to a vision-capable model or the image will not be analyzed.
        </p>
      )}
    </div>
  );
};
