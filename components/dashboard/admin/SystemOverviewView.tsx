'use client';

import React, { useEffect, useState } from 'react';
import { Activity, Users, Server, ShieldCheck, Zap, Bot, FolderGit2 } from 'lucide-react';
import { apiFetch } from '@/lib/auth/session-client';
import { PlatformOverview } from '@/lib/types';

export const SystemOverviewView: React.FC = () => {
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    apiFetch('/api/v1/admin/overview')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Failed to load overview');
        if (!ignore) setOverview(data.overview);
      })
      .catch((err: unknown) => {
        if (!ignore) setError((err as Error).message);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const stats = overview
    ? [
        { title: 'Total Users', value: String(overview.totalUsers), icon: Users, color: 'text-cyan-400' },
        { title: 'Active Users', value: String(overview.activeUsers), icon: ShieldCheck, color: 'text-emerald-400' },
        { title: 'Total Requests', value: String(overview.totalRequests), icon: Activity, color: 'text-indigo-400' },
        { title: 'Token Usage', value: overview.totalTokens.toLocaleString(), icon: Zap, color: 'text-purple-400' },
        { title: 'Avg Latency', value: `${overview.avgLatencyMs}ms`, icon: Zap, color: 'text-amber-400' },
        { title: 'Enabled Providers', value: `${overview.enabledProviderCount}/${overview.providerCount}`, icon: Server, color: 'text-cyan-400' },
        { title: 'Agents', value: String(overview.agentCount), icon: Bot, color: 'text-indigo-400' },
        { title: 'Projects', value: String(overview.projectCount), icon: FolderGit2, color: 'text-emerald-400' },
      ]
    : [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Dashboard</h2>
          <p className="text-zinc-400 text-sm mt-1">Live platform metrics from OmniAgent APIs.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold">
          <ShieldCheck className="w-3.5 h-3.5" /> Admin Privileged
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs p-3">{error}</div>
      )}

      {!overview && !error && (
        <div className="text-xs text-zinc-500">Loading live metrics...</div>
      )}

      {overview && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {stats.map((stat) => (
              <div key={stat.title} className="glass-card rounded-2xl p-5 border border-white/5">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{stat.title}</div>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <div className="text-2xl font-extrabold text-white mt-3 tabular-nums">{stat.value}</div>
              </div>
            ))}
          </div>
          <div className="glass-card rounded-2xl p-5 border border-white/5 text-xs text-zinc-400 space-y-1">
            <div>Database: {overview.databaseAdapter} ({overview.databaseStatus})</div>
            <div>Gemini engine: {overview.geminiConfigured ? 'configured' : 'unconfigured'}</div>
            <div>Failed requests: {overview.failedRequests}</div>
          </div>
        </>
      )}
    </div>
  );
};
