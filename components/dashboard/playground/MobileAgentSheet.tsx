'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const MobileAgentSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, onClose, children }) => {
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
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Agent parameters">
      <button type="button" aria-label="Close agent parameters" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl border border-white/10 bg-zinc-950 shadow-[0_-12px_40px_rgba(0,0,0,0.45)]">
        <div className="flex shrink-0 items-center justify-between px-4 pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-white/15" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-sm font-semibold text-zinc-100">Agent Parameters</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>
    </div>
  );
};
