'use client';

import React from 'react';
import { Activity, Users, Server, ShieldCheck, Zap } from 'lucide-react';

export const SystemOverviewView: React.FC = () => {
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">System Overview</h2>
          <p className="text-zinc-400 text-sm mt-1">
            Global health status and operational metrics.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-bold">
          <ShieldCheck className="w-3.5 h-3.5" /> Admin Privileged
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { title: 'System Health', value: '99.99%', icon: Activity, color: 'text-emerald-400' },
          { title: 'Total Users', value: '1,284', icon: Users, color: 'text-cyan-400' },
          { title: 'Active Providers', value: '8', icon: Server, color: 'text-indigo-400' },
          { title: 'Avg Latency', value: '142ms', icon: Zap, color: 'text-purple-400' },
        ].map((stat) => (
          <div key={stat.title} className="glass-card rounded-2xl p-5 border border-white/5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{stat.title}</div>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div className="text-2xl font-extrabold text-white mt-3 tabular-nums">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
