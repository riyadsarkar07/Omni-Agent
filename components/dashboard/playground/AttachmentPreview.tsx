'use client';

import React from 'react';
import { FileText, Image as ImageIcon, X } from 'lucide-react';

export interface PendingAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
}

export const AttachmentPreview: React.FC<{
  files: PendingAttachment[];
  onRemove: (id: string) => void;
  unsupported?: boolean;
}> = ({ files, onRemove, unsupported }) => {
  if (!files.length) return null;

  return (
    <div className="space-y-2 px-1 pb-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {files.map((file) => (
          <div
            key={file.id}
            className="relative flex min-w-[140px] max-w-[180px] items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/80 p-2"
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
              <div className="text-[10px] text-zinc-500">{Math.max(1, Math.round(file.size / 1024))} KB</div>
            </div>
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
      {unsupported && (
        <p className="text-[11px] leading-relaxed text-amber-300/90">
          Chat currently accepts text only. This file will not be sent to the model.
        </p>
      )}
    </div>
  );
};
