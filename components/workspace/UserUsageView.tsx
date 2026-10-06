'use client';

import React from 'react';
import { UsageLog } from '@/lib/types';
import { Activity, Zap, Clock } from 'lucide-react';

interface UserUsageViewProps {
  usageSummary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    avgLatencyMs: number;
    recentLogs: UsageLog[];
  };
}

export const UserUsageView: React.FC<UserUsageViewProps> = ({ usageSummary }) => {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Usage</h2>
        <p className="text-sm text-zinc-400 mt-1">Your workspace request and token summary.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>
    </div>
  );
};
