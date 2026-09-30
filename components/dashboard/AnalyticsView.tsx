'use client';

import React from 'react';
import { UsageLog, Project } from '@/lib/types';
import {
  BarChart3,
  TrendingUp,
  Activity,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface AnalyticsViewProps {
  usageSummary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
    promptTokens: number;
    candidateTokens: number;
    avgLatencyMs: number;
    recentLogs: UsageLog[];
  };
  activeProject: Project | null;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ usageSummary, activeProject }) => {
  const successRate =
    usageSummary.totalRequests > 0
      ? ((usageSummary.successfulRequests / usageSummary.totalRequests) * 100).toFixed(1)
      : '100.0';

  // Group logs by model
  const modelBreakdown: Record<string, number> = {};
  for (const log of usageSummary.recentLogs) {
    modelBreakdown[log.model] = (modelBreakdown[log.model] || 0) + 1;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">API Usage & Token Telemetry</h2>
        <p className="text-xs text-slate-400">
          Real-time metrics, error distribution, and Gemini token throughput for{' '}
          <span className="text-cyan-400 font-semibold">{activeProject?.name || 'All Projects'}</span>.
        </p>
      </div>

      {/* Top 4 Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Invocations</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white">{usageSummary.totalRequests}</div>
          <div className="text-[11px] text-emerald-400 font-medium">{successRate}% success rate</div>
        </div>

        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Tokens Consumed</span>
            <Zap className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {usageSummary.totalTokens.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400">Prompt: {usageSummary.promptTokens.toLocaleString()} | Completion: {usageSummary.candidateTokens.toLocaleString()}</div>
        </div>

        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Average Latency</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">{usageSummary.avgLatencyMs}ms</div>
          <div className="text-[11px] text-slate-400">Measured server-side</div>
        </div>

        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Failed Invocations</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400">{usageSummary.failedRequests}</div>
          <div className="text-[11px] text-slate-400">Rate limits / network</div>
        </div>
      </div>

      {/* Model Distribution & Token Composition Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Model distribution */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            Model Request Share
          </h3>
          <div className="space-y-3">
            {Object.entries(modelBreakdown).map(([modelName, count]) => {
              const pct = Math.round((count / (usageSummary.recentLogs.length || 1)) * 100);
              return (
                <div key={modelName} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-300 font-mono">{modelName}</span>
                    <span className="text-slate-400">
                      {count} calls ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Token breakdown card */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-purple-400" />
            Estimated Token Breakdown
          </h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">Prompt / Input Tokens</span>
                <span className="text-cyan-400">{usageSummary.promptTokens.toLocaleString()}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-cyan-400"
                  style={{
                    width: `${
                      usageSummary.totalTokens > 0
                        ? (usageSummary.promptTokens / usageSummary.totalTokens) * 100
                        : 50
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">Candidate / Output Tokens</span>
                <span className="text-indigo-400">{usageSummary.candidateTokens.toLocaleString()}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{
                    width: `${
                      usageSummary.totalTokens > 0
                        ? (usageSummary.candidateTokens / usageSummary.totalTokens) * 100
                        : 50
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
              Tokens are calculated using standard Gemini tokenizer rules. Sensitive input prompts and API keys are redacted before telemetry indexing.
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Logs Table */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <h3 className="font-bold text-xs text-white uppercase tracking-wider">
            Live Request Audit Stream (Redacted)
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">Max 50 recent events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/20 text-slate-400 font-semibold">
                <th className="py-2.5 px-4">Endpoint</th>
                <th className="py-2.5 px-4">Model</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Latency</th>
                <th className="py-2.5 px-4">Prompt Tokens</th>
                <th className="py-2.5 px-4">Output Tokens</th>
                <th className="py-2.5 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
              {usageSummary.recentLogs.map((log) => {
                const isSuccess = log.status_code >= 200 && log.status_code < 300;
                return (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-200">
                      {log.endpoint}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">{log.model}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                          isSuccess
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {isSuccess ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}
                        {log.status_code}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">{log.latency_ms}ms</td>
                    <td className="py-2.5 px-4 text-slate-400">{log.prompt_tokens}</td>
                    <td className="py-2.5 px-4 text-slate-400">{log.candidate_tokens}</td>
                    <td className="py-2.5 px-4 text-right font-sans text-slate-400 text-[11px]">
                      {new Date(log.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
