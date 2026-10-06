'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const MobileNavigationDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}> = ({ open, onClose, title = 'Conversations', children }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close conversations"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] max-w-full flex-col border-r border-white/10 bg-zinc-950 shadow-2xl">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 px-3">
          <span className="text-sm font-semibold text-zinc-100">{title}</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
};
