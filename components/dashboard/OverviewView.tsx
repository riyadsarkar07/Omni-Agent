'use client';

import React, { useState, useEffect } from 'react';
import { Project, Agent, ApiKey, UsageLog } from '@/lib/types';
import {
  FolderGit2,
  Bot,
  KeyRound,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Clock,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  Server,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface OverviewViewProps {
  projects: Project[];
  agents: Agent[];
  apiKeys: ApiKey[];
  usageSummary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    avgLatencyMs: number;
    recentLogs: UsageLog[];
  };
  onNavigate: (tab: any) => void;
  onOpenCreateAgent: () => void;
  onOpenCreateKey: () => void;
}

const MetricCard = ({ title, value, icon: Icon, color, subValue, pulse }: { title: string, value: string | number, icon: any, color: string, subValue?: React.ReactNode, pulse?: boolean }) => (
  <div className="glass-card rounded-2xl p-5 flex items-start justify-between relative overflow-hidden group">
    <div className="relative z-10">
      <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{title}</div>
      <div className="text-3xl font-extrabold text-white mt-1 tabular-nums">{value}</div>
      {subValue && <div className="text-[11px] text-zinc-400 mt-2 flex items-center gap-1.5">{subValue}</div>}
    </div>
    <div className={`p-3 rounded-xl ${color} bg-white/5 border border-white/5 relative z-10 transition-transform group-hover:scale-110`}>
      <Icon className="w-5 h-5" />
    </div>
    {/* Decorative background glow */}
    <div className={`absolute -bottom-6 -right-6 w-24 h-24 ${color.replace('text-', 'bg-')}/10 rounded-full blur-2xl pointer-events-none transition-opacity group-hover:opacity-75 opacity-25`} />
  </div>
);

export const OverviewView: React.FC<OverviewViewProps> = ({
  projects,
  agents,
  apiKeys,
  usageSummary,
  onNavigate,
  onOpenCreateAgent,
  onOpenCreateKey,
}) => {
  const [providers, setProviders] = useState<any[]>([]);

  useEffect(() => {
    let ignore = false;
    fetch('/api/v1/providers')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.providers && !ignore) setProviders(data.providers);
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);

  const successRate = usageSummary.totalRequests > 0
    ? Math.round((usageSummary.successfulRequests / usageSummary.totalRequests) * 100)
    : 100;

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto w-full animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Workspace Overview</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your AI projects, agents, endpoints, and activity from one dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onNavigate('playground')}
            className="px-4 py-2 bg-white hover:bg-zinc-100 text-zinc-950 text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-lg"
          >
            <Sparkles className="w-3.5 h-3.5" /> Launch Playground
          </button>
          <button
            onClick={() => onNavigate('docs')}
            className="px-4 py-2 bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors shadow-sm"
          >
            API Docs <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Total Projects"
          value={projects.length}
          icon={FolderGit2}
          color="text-cyan-400"
          subValue="Isolated project workspaces"
        />
        <MetricCard
          title="Active Agents"
          value={agents.length}
          icon={Bot}
          color="text-indigo-400"
          subValue={<><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse text-emerald-400" /> All published & ready</>}
        />
        <MetricCard
          title="API Invocations"
          value={usageSummary.totalRequests.toLocaleString()}
          icon={Activity}
          color="text-amber-400"
          subValue={<><TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> <span className="text-emerald-400 font-bold">{successRate}%</span> success rate</>}
        />
        <MetricCard
          title="Tokens Processed"
          value={usageSummary.totalTokens.toLocaleString()}
          icon={Zap}
          color="text-purple-400"
          subValue={<><Clock className="w-3.5 h-3.5 text-cyan-400" /> Avg latency: <span className="text-white font-semibold">{usageSummary.avgLatencyMs}ms</span></>}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column - Double Wide */}
        <div className="lg:col-span-2 space-y-8">

          {/* Recent API Logs Table */}
          <div className="glass-card rounded-2xl p-6 border border-white/5 relative overflow-hidden">
            <div className="flex items-center justify-between mb-6 relative z-10">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-sm text-white tracking-wide">Recent Telemetry</h3>
              </div>
              <button onClick={() => onNavigate('analytics')} className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer transition">
                Full Analytics →
              </button>
            </div>

            <div className="overflow-x-auto relative z-10">
              <table className="w-full text-left text-xs min-w-[600px]">
                <thead>
                  <tr className="border-b border-white/10 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="pb-3 px-2">Endpoint</th>
                    <th className="pb-3 px-2">Model</th>
                    <th className="pb-3 px-2">Status</th>
                    <th className="pb-3 px-2">Latency</th>
                    <th className="pb-3 px-2">Tokens</th>
                    <th className="pb-3 px-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {usageSummary.recentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-500">
                        No activity records found yet. Route some traffic to populate logs!
                      </td>
                    </tr>
                  ) : (
                    usageSummary.recentLogs.slice(0, 6).map((log) => {
                      const isSuccess = log.status_code >= 200 && log.status_code < 300;
                      return (
                        <tr key={log.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="py-3 px-2 font-mono text-[11px] font-medium text-zinc-200">
                            {log.endpoint}
                          </td>
                          <td className="py-3 px-2 text-zinc-400">{log.model}</td>
                          <td className="py-3 px-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${isSuccess ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>
                              {isSuccess ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                              {log.status_code}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-zinc-300 tabular-nums">{log.latency_ms}ms</td>
                          <td className="py-3 px-2 text-zinc-400 tabular-nums">{log.total_tokens}</td>
                          <td className="py-3 px-2 text-right font-mono text-zinc-400 text-[10px]">
                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sub-grid: Projects vs Agents */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-panel rounded-2xl p-5 border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-cyan-400" />
                  Recent Projects
                </h3>
              </div>
              <div className="space-y-3">
                {projects.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-white/5 hover:bg-zinc-900 transition-colors">
                    <div>
                      <div className="font-bold text-sm text-zinc-100">{p.name}</div>
                      <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wide">ID: {p.slug}</div>
                    </div>
                    <span className="text-[10px] font-bold text-cyan-400 px-2 py-1 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                      {p.rate_limit_rpm} RPM
                    </span>
                  </div>
                ))}
                {projects.length === 0 && <div className="py-4 text-center text-zinc-500 text-xs shadow-inner rounded-lg bg-zinc-950/50">No projects</div>}
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-5 border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-400" />
                  Recent Agents
                </h3>
              </div>
              <div className="space-y-3">
                {agents.slice(0, 3).map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-white/5 hover:bg-zinc-900 transition-colors">
                    <div>
                      <div className="font-bold text-sm text-zinc-100">{a.name}</div>
                      <div className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wide">MDL: {a.model}</div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                      ONLINE
                    </span>
                  </div>
                ))}
                {agents.length === 0 && <div className="py-4 text-center text-zinc-500 text-xs shadow-inner rounded-lg bg-zinc-950/50">No agents</div>}
              </div>
            </div>
          </div>

        </div>

        {/* Right Column - Single */}
        <div className="space-y-6">

          {/* Quick Setup Actions */}
          <div className="glass-card rounded-2xl p-6 border border-white/5 relative overflow-hidden">
            <h3 className="font-bold text-sm text-white flex items-center gap-2 mb-4 relative z-10">
              <Zap className="w-4 h-4 text-amber-400" /> Actions
            </h3>
            <div className="space-y-2.5 relative z-10">
              <button onClick={onOpenCreateAgent} className="w-full relative flex items-center justify-between p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all group overflow-hidden">
                <div className="text-left">
                  <div className="text-xs font-bold text-white group-hover:text-cyan-300">Create New Agent</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Custom persona & tools</div>
                </div>
                <Bot className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400 transition" />
              </button>
              <button onClick={onOpenCreateKey} className="w-full relative flex items-center justify-between p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-transparent hover:border-white/10 transition-all group overflow-hidden">
                <div className="text-left">
                  <div className="text-xs font-bold text-white group-hover:text-cyan-300">Issue API Key</div>
                  <div className="text-[10px] text-zinc-400 mt-0.5">Versioned access tokens</div>
                </div>
                <KeyRound className="w-4 h-4 text-zinc-500 group-hover:text-cyan-400 transition" />
              </button>
              <button onClick={() => onNavigate('playground')} className="w-full relative flex items-center justify-between p-3.5 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 border border-cyan-500/20 transition-all group overflow-hidden">
                <div className="text-left">
                  <div className="text-xs font-bold text-cyan-300">Interactive Playground</div>
                  <div className="text-[10px] text-cyan-500 mt-0.5">Test adapters live</div>
                </div>
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </button>
            </div>
          </div>

          {/* Providers Status */}
          <div className="glass-panel rounded-2xl p-6 border border-white/5">
            <h3 className="font-bold text-sm text-white flex items-center gap-2 mb-4">
              <Server className="w-4 h-4 text-cyan-400" /> Provider Registry
            </h3>
            <div className="space-y-2">
              {providers.length === 0 ? (
                <div className="py-4 text-center text-zinc-500 text-xs">Fetching registry...</div>
              ) : providers.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-900 border border-white/5">
                  <div>
                    <div className="text-xs font-bold text-zinc-200">{p.name}</div>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-wide border ${p.enabled ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-zinc-500 bg-zinc-800 border-zinc-700'}`}>
                    {p.enabled ? 'Active' : 'Offline'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Infrastructure Models Checklist */}
          <div className="glass-panel rounded-2xl p-6 border border-white/5">
            <h3 className="font-bold text-sm text-white flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-indigo-400" /> Inference Targets
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-white/5">
                <div>
                  <div className="text-xs font-bold text-zinc-200">Gemini 3.8 Flash</div>
                </div>
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20 uppercase">Ready</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-white/5">
                <div>
                  <div className="text-xs font-bold text-zinc-200">Claude 3.5 Sonnet</div>
                </div>
                <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20 uppercase">Mapped</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-900/50 border border-white/5">
                <div>
                  <div className="text-xs font-bold text-zinc-200">GPT-4o</div>
                </div>
                <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-1 rounded-md border border-cyan-500/20 uppercase">Mapped</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
