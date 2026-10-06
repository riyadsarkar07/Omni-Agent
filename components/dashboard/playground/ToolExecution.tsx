'use client';

import React, { useState } from 'react';
import { Check, ChevronDown, Wrench } from 'lucide-react';

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export const ToolExecution: React.FC<{ toolCalls: ToolCall[] }> = ({ toolCalls }) => {
  const [open, setOpen] = useState(false);
  if (!toolCalls.length) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-cyan-500/15 bg-cyan-500/5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-semibold text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50"
      >
        <span className="inline-flex items-center gap-2">
          <Wrench className="h-3.5 w-3.5" />
          Agent execution
          <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {toolCalls.length}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="space-y-1.5 border-t border-white/5 px-3 py-2 text-[11px] text-zinc-300">
          <li className="flex items-center gap-2">
            <Check className="h-3 w-3 text-emerald-400" />
            Analyze
          </li>
          {toolCalls.map((call, idx) => (
            <li key={`${call.name}-${idx}`} className="space-y-1">
              <div className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-400" />
                Tool call: <span className="font-mono text-cyan-200">{call.name}</span>
              </div>
              <pre className="max-h-28 overflow-auto rounded-lg bg-zinc-950/70 p-2 font-mono text-[10px] text-zinc-400">
                {JSON.stringify({ args: call.args, result: call.result }, null, 2)}
              </pre>
              <div className="flex items-center gap-2">
                <Check className="h-3 w-3 text-emerald-400" />
                Process result
              </div>
            </li>
          ))}
          <li className="flex items-center gap-2">
            <Check className="h-3 w-3 text-emerald-400" />
            Generate
          </li>
        </ol>
      )}
    </div>
  );
};
