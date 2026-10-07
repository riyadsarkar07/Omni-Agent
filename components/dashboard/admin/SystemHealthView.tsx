'use client';

import React, { useEffect, useState } from 'react';
import { Zap, Activity } from 'lucide-react';
import { apiFetch } from '@/lib/auth/session-client';

interface HealthPayload {
  status?: string;
  database?: { adapter?: string; status?: string; configured?: boolean };
  gemini_engine?: { status?: string; configured?: boolean; connectivity?: string };
  providers?: { configured?: number; enabled?: number; connected?: number };
  missing_production_secrets?: string[];
}

export const SystemHealthView: React.FC = () => {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    apiFetch('/api/v1/health')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load health');
        if (!ignore) setHealth(data);
      })
      .catch((err: unknown) => {
        if (!ignore) setError((err as Error).message);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const services = health
    ? [
        { name: 'API', status: health.status || 'unknown' },
        { name: 'Database config', status: health.database?.configured ? 'configured' : 'unconfigured' },
        { name: 'Database', status: health.database?.status || 'unknown' },
        { name: 'Gemini config', status: health.gemini_engine?.configured ? 'configured' : 'unconfigured' },
        { name: 'Gemini connectivity', status: health.gemini_engine?.connectivity || 'not-probed' },
        { name: 'Enabled providers', status: String(health.providers?.enabled ?? 0) },
        { name: 'Connected providers', status: String(health.providers?.connected ?? 0) },
      ]
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto w-full">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">System Health</h2>
        <p className="text-zinc-400 text-sm mt-1">Live component status from `/api/v1/health`.</p>
      </div>

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs p-3">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-6 border border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-400 border border-emerald-500/20"><Activity className="w-5 h-5" /></div>
            <h3 className="font-bold text-lg text-white">Service Status</h3>
          </div>
          <div className="space-y-4">
            {services.map((service) => (
              <div key={service.name} className="flex justify-between items-center text-sm">
                <span className="text-zinc-300 font-medium">{service.name}</span>
                <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-md text-[10px] uppercase">{service.status}</span>
              </div>
            ))}
            {!health && !error && <div className="text-xs text-zinc-500">Loading health...</div>}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-amber-500/10 p-2 rounded-xl text-amber-400 border border-amber-500/20"><Zap className="w-5 h-5" /></div>
            <h3 className="font-bold text-lg text-white">Runtime</h3>
          </div>
          <div className="text-xs text-zinc-400 space-y-2">
            <div>Adapter: {health?.database?.adapter || 'unknown'}</div>
            <div>Missing production secrets: {(health?.missing_production_secrets || []).length}</div>
            {(health?.missing_production_secrets || []).map((secret) => (
              <div key={secret} className="text-amber-300">{secret}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
