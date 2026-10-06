'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Agent } from '@/lib/types';

const AVAILABLE_TOOLS = [
  { id: 'calculator', displayName: 'Math Calculator' },
  { id: 'get_current_time', displayName: 'World Clock & Timestamp' },
  { id: 'web_search', displayName: 'Web Knowledge Lookup' },
  { id: 'generate_uuid', displayName: 'UUID Generator' },
];

interface AdvancedSettingsProps {
  agent: Agent | undefined;
  maxOutputTokens: number;
  topP: number;
  topK: number;
  memoryEnabled: boolean;
  toolsEnabled: string[];
  onMaxOutputTokens: (v: number) => void;
  onTopP: (v: number) => void;
  onTopK: (v: number) => void;
  onMemoryEnabled: (v: boolean) => void;
  onToolsEnabled: (v: string[]) => void;
}

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({
  agent,
  maxOutputTokens,
  topP,
  topK,
  memoryEnabled,
  toolsEnabled,
  onMaxOutputTokens,
  onTopP,
  onTopK,
  onMemoryEnabled,
  onToolsEnabled,
}) => {
  const [open, setOpen] = useState(false);
  if (!agent) return null;

  const toggleTool = (id: string) => {
    onToolsEnabled(toolsEnabled.includes(id) ? toolsEnabled.filter((t) => t !== id) : [...toolsEnabled, id]);
  };

  return (
    <div className="rounded-lg border border-white/10 bg-zinc-950/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400"
      >
        Advanced Configuration
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-white/5 px-3 py-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-semibold text-zinc-400">
              <span>Max Output Tokens</span>
              <span className="font-mono text-zinc-300">{maxOutputTokens || 'default'}</span>
            </div>
            <input
              type="range"
              min="256"
              max="8192"
              step="256"
              value={maxOutputTokens || 2048}
              onChange={(e) => onMaxOutputTokens(parseInt(e.target.value, 10))}
              className="w-full accent-cyan-500"
              aria-label="Max output tokens"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-semibold text-zinc-400">
              <span>Top P</span>
              <span className="font-mono text-zinc-300">{topP.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={topP}
              onChange={(e) => onTopP(parseFloat(e.target.value))}
              className="w-full accent-cyan-500"
              aria-label="Top P"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] font-semibold text-zinc-400">
              <span>Top K</span>
              <span className="font-mono text-zinc-300">{topK}</span>
            </div>
            <input
              type="range"
              min="1"
              max="64"
              step="1"
              value={topK}
              onChange={(e) => onTopK(parseInt(e.target.value, 10))}
              className="w-full accent-cyan-500"
              aria-label="Top K"
            />
          </div>

          <label className="flex min-h-11 items-center justify-between gap-3 text-[12px] text-zinc-200">
            <span>
              Memory
              <span className="block text-[10px] font-normal text-zinc-500">Include prior turns from this conversation</span>
            </span>
            <input
              type="checkbox"
              checked={memoryEnabled}
              onChange={(e) => onMemoryEnabled(e.target.checked)}
              className="h-4 w-4 accent-cyan-500"
            />
          </label>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-zinc-400">Tools</div>
            <div className="space-y-1">
              {AVAILABLE_TOOLS.map((tool) => (
                <label key={tool.id} className="flex min-h-10 items-center justify-between gap-3 text-[12px] text-zinc-300">
                  <span>{tool.displayName}</span>
                  <input
                    type="checkbox"
                    checked={toolsEnabled.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                    className="h-4 w-4 accent-cyan-500"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
