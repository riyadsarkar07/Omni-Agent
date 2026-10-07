'use client';

import React from 'react';
import { UsageLog } from '@/lib/types';
import { Activity, Clock, Gauge, Zap } from 'lucide-react';

interface UserUsageViewProps {
  usageSummary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    avgLatencyMs: number;
    recentLogs: UsageLog[];
  };
  quota?: {
    monthlyUsed: number;
    monthlyLimit: number;
    remaining: number;
  } | null;
}

export const UserUsageView: React.FC<UserUsageViewProps> = ({ usageSummary, quota }) => {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Usage</h2>
        <p className="text-sm text-zinc-400 mt-1">Your workspace request, token, and monthly quota summary.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl border border-white/5 p-5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-cyan-400" /> Requests
          </div>
          <div className="text-2xl font-extrabold text-white mt-2">{usageSummary.totalRequests}</div>
        </div>
        <div className="glass-card rounded-2xl border border-white/5 p-5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-purple-400" /> Tokens
          </div>
          <div className="text-2xl font-extrabold text-white mt-2">{usageSummary.totalTokens.toLocaleString()}</div>
        </div>
        <div className="glass-card rounded-2xl border border-white/5 p-5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-amber-400" /> Avg latency
          </div>
          <div className="text-2xl font-extrabold text-white mt-2">{usageSummary.avgLatencyMs}ms</div>
        </div>
        <div className="glass-card rounded-2xl border border-white/5 p-5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 flex items-center gap-2">
            <Gauge className="w-3.5 h-3.5 text-emerald-400" /> Monthly quota
          </div>
          <div className="text-2xl font-extrabold text-white mt-2">
            {quota ? `${quota.monthlyUsed}/${quota.monthlyLimit}` : '—'}
          </div>
          {quota && <div className="text-[11px] text-zinc-500 mt-1">{quota.remaining} remaining</div>}
        </div>
      </div>
    </div>
  );
};
