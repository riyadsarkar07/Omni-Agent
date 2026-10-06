'use client';

import React from 'react';
import { AIProvider } from '@/lib/providers/types';

export const ProviderSelector: React.FC<{
  providers: AIProvider[];
  value: string;
  onChange: (providerId: string) => void;
}> = ({ providers, value, onChange }) => {
  const enabled = providers.filter((p) => p.enabled);

  return (
    <div className="space-y-1.5">
      <label htmlFor="oa-provider" className="text-[11px] font-semibold text-zinc-400">
        Provider
      </label>
      <select
        id="oa-provider"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-xs text-zinc-200 focus:border-cyan-500/40 focus:outline-none"
      >
        {enabled.length === 0 && <option value="">No providers available</option>}
        {enabled.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
};

export const ModelSelector: React.FC<{
  models: string[];
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
}> = ({ models, value, onChange, disabled }) => {
  return (
    <div className="space-y-1.5">
      <label htmlFor="oa-model" className="text-[11px] font-semibold text-zinc-400">
        Model
      </label>
      <select
        id="oa-model"
        value={value}
        disabled={disabled || models.length === 0}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-xs text-zinc-200 focus:border-cyan-500/40 focus:outline-none disabled:opacity-50"
      >
        {models.length === 0 && <option value="">No models available</option>}
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
};
