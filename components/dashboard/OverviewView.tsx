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
        if (data.success && data.providers && !ignore) {
          setProviders(data.providers);
        }
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  const successRate =
    usageSummary.totalRequests > 0
      ? Math.round((usageSummary.successfulRequests / usageSummary.totalRequests) * 100)
      : 100;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto w-full">
      {/* Compact Dashboard Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Overview</h1>
          <p className="text-slate-400 text-xs md:text-sm mt-1">
            Manage your AI projects, agents, providers, API usage and activity from one dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onNavigate('playground')}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-cyan-500/15"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Launch Playground
          </button>
          <button
            onClick={() => onNavigate('docs')}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            REST API Docs
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Metric Cards Grid - Fully Responsive */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Projects Card */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Projects</span>
            <FolderGit2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight tabular-nums">{projects.length}</div>
          <div className="text-[10px] text-slate-500">Isolated project workspaces</div>
        </div>

        {/* Agents Card */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Active Agents</span>
            <Bot className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight tabular-nums">{agents.length}</div>
          <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            All published & ready
          </div>
        </div>

        {/* API Calls Card */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>API Invocations</span>
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight tabular-nums">
            {usageSummary.totalRequests.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-bold">{successRate}%</span> success rate
          </div>
        </div>

        {/* Estimated Tokens Card */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Estimated Tokens</span>
            <Zap className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-3xl font-extrabold text-white tracking-tight tabular-nums">
            {usageSummary.totalTokens.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            Avg latency: <span className="text-slate-300 font-semibold">{usageSummary.avgLatencyMs}ms</span>
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Double-Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent API Logs Table */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-4 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-sm text-white">Recent API Activity Logs</h3>
              </div>
              <button
                onClick={() => onNavigate('analytics')}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
              >
                Full Analytics →
              </button>
            </div>

            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-left text-xs min-w-[500px]">
                <thead>
                  <tr className="border-b border-slate-800/80 text-slate-400 font-semibold">
                    <th className="pb-2.5">Endpoint</th>
                    <th className="pb-2.5">Model</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5">Latency</th>
                    <th className="pb-2.5">Tokens</th>
                    <th className="pb-2.5 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono text-[11px]">
                  {usageSummary.recentLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-500 font-sans">
                        No activity records found yet. Run some chat sessions to populate logs!
                      </td>
                    </tr>
                  ) : (
                    usageSummary.recentLogs.slice(0, 7).map((log) => {
                      const isSuccess = log.status_code >= 200 && log.status_code < 300;
                      return (
                        <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 font-sans font-medium text-slate-200">
                            {log.endpoint}
                          </td>
                          <td className="py-2.5 text-slate-400">{log.model}</td>
                          <td className="py-2.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                isSuccess
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {isSuccess ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                              {log.status_code}
                            </span>
                          </td>
                          <td className="py-2.5 text-slate-300 tabular-nums">{log.latency_ms}ms</td>
                          <td className="py-2.5 text-slate-400 tabular-nums">{log.total_tokens}</td>
                          <td className="py-2.5 text-right font-sans text-slate-400">
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

          {/* Sub-grid for Recent Projects and Recent Agents */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Recent Workspaces / Projects */}
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-cyan-400" />
                  Recent Projects
                </h3>
                <button
                  onClick={() => onNavigate('projects')}
                  className="text-[11px] text-slate-400 hover:text-white"
                >
                  Manage →
                </button>
              </div>
              <div className="space-y-2 text-xs">
                {projects.slice(0, 3).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 border border-slate-800/40">
                    <div>
                      <div className="font-bold text-slate-200">{p.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">slug: {p.slug}</div>
                    </div>
                    <span className="text-[10px] font-bold text-cyan-400 font-mono bg-cyan-500/5 border border-cyan-500/10 px-1.5 py-0.5 rounded">
                      {p.rate_limit_rpm} RPM
                    </span>
                  </div>
                ))}
                {projects.length === 0 && (
                  <div className="py-4 text-center text-slate-500 text-xs">No projects configured.</div>
                )}
              </div>
            </div>

            {/* Recent AI Agents */}
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-400" />
                  Recent Agents
                </h3>
                <button
                  onClick={() => onNavigate('agents')}
                  className="text-[11px] text-slate-400 hover:text-white"
                >
                  Manage →
                </button>
              </div>
              <div className="space-y-2 text-xs">
                {agents.slice(0, 3).map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 border border-slate-800/40">
                    <div>
                      <div className="font-bold text-slate-200">{a.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">model: {a.model}</div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-1.5 py-0.5 rounded">
                      Active
                    </span>
                  </div>
                ))}
                {agents.length === 0 && (
                  <div className="py-4 text-center text-slate-500 text-xs">No agents configured.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Single-Column */}
        <div className="space-y-6">
          {/* Quick Setup Actions */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-3 shadow-sm">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Quick Actions
            </h3>

            <div className="space-y-2">
              <button
                onClick={onOpenCreateAgent}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-all cursor-pointer group"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300">
                    Create New Agent
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Configure custom persona & tools</div>
                </div>
                <Bot className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors" />
              </button>

              <button
                onClick={onOpenCreateKey}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left transition-all cursor-pointer group"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300">
                    Generate API Key
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Access versioned endpoint tokens</div>
                </div>
                <KeyRound className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors" />
              </button>

              <button
                onClick={() => onNavigate('playground')}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-cyan-950/40 to-indigo-950/40 hover:from-cyan-900/50 hover:to-indigo-900/50 border border-cyan-800/40 text-left transition-all cursor-pointer group"
              >
                <div>
                  <div className="text-xs font-semibold text-cyan-200">
                    Interactive Playground
                  </div>
                  <div className="text-[10px] text-cyan-400/80 mt-0.5">Test routing adapters live</div>
                </div>
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </button>
            </div>
          </div>

          {/* AI Providers Status Dashboard */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                AI Providers Status
              </h3>
              <button
                onClick={() => onNavigate('providers')}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                Registry →
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {providers.length === 0 ? (
                <div className="py-4 text-center text-slate-500">Retrieving providers...</div>
              ) : (
                providers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 border border-slate-800/40">
                    <div>
                      <div className="font-bold text-slate-200">{p.name}</div>
                      <div className="text-[9px] text-slate-500 font-mono mt-0.5 truncate max-w-[150px]">{p.baseUrl}</div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      p.enabled
                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        : 'text-slate-400 bg-slate-800 border-slate-700'
                    }`}>
                      {p.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Static Supported Models Checklist */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-3 shadow-sm">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Supported Router Models
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-800/40">
                <div>
                  <div className="font-semibold text-slate-200">Gemini 3.8 Flash</div>
                  <div className="text-[10px] text-slate-400">Default general purpose model</div>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  Ready
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-800/40">
                <div>
                  <div className="font-semibold text-slate-200">Claude 3.5 Sonnet</div>
                  <div className="text-[10px] text-slate-400">Anthropic reasoning flagship</div>
                </div>
                <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  Active
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-800/40">
                <div>
                  <div className="font-semibold text-slate-200">GPT-4o / GPT-4o-Mini</div>
                  <div className="text-[10px] text-slate-400">OpenAI compatible benchmarks</div>
                </div>
                <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  Active
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
