'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Server } from 'lucide-react';
import { apiFetch } from '@/lib/auth/session-client';

interface CatalogModel {
  id: string;
  providerId: string;
  providerName: string;
  protocol?: string;
  isDefault?: boolean;
}

export const ModelsCatalogView: React.FC = () => {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    apiFetch('/api/v1/models')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load models');
        if (ignore) return;
        setModels(data.models || []);
        setDefaultModel(data.defaultModel || null);
      })
      .catch((err: unknown) => {
        if (!ignore) setError((err as Error).message);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogModel[]>();
    for (const model of models) {
      const key = model.providerName || model.providerId;
      const list = map.get(key) || [];
      list.push(model);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [models]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto w-full">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Models</h2>
        <p className="text-zinc-400 text-sm mt-1">
          Catalog of models exposed by enabled providers. Provider credentials stay on the server.
        </p>
      </div>

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs p-3">{error}</div>}

      <div className="glass-card rounded-2xl border border-white/5 p-5 text-xs text-zinc-400">
        Default model: <span className="text-white font-semibold">{defaultModel || 'None'}</span>
      </div>

      {grouped.length === 0 && !error && (
        <div className="text-xs text-zinc-500">No enabled provider models are available yet.</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {grouped.map(([providerName, list]) => (
          <div key={providerName} className="glass-card rounded-2xl border border-white/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" />
              <div className="font-bold text-sm text-white">{providerName}</div>
            </div>
            <div className="space-y-2">
              {list.map((model) => (
                <div key={`${model.providerId}:${model.id}`} className="flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-300">{model.id}</span>
                  {model.isDefault || model.id === defaultModel ? (
                    <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">Default</span>
                  ) : (
                    <Activity className="w-3 h-3 text-zinc-600" />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
