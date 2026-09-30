'use client';

import React, { useState } from 'react';
import { ApiKey, Project } from '@/lib/types';
import {
  KeyRound,
  Plus,
  Copy,
  Check,
  ShieldAlert,
  Trash2,
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  X,
  AlertTriangle,
} from 'lucide-react';

interface ApiKeysViewProps {
  apiKeys: ApiKey[];
  projects: Project[];
  activeProject: Project | null;
  onRefresh: () => void;
}

export const ApiKeysView: React.FC<ApiKeysViewProps> = ({
  apiKeys,
  projects,
  activeProject,
  onRefresh,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [environment, setEnvironment] = useState<'production' | 'development'>('production');
  const [rateLimitRpm, setRateLimitRpm] = useState(60);
  const [targetProjectId, setTargetProjectId] = useState(activeProject?.id || projects[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Secret reveal modal state
  const [revealedKey, setRevealedKey] = useState<{ rawKey: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) {
      setError('Key name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-admin': 'true' },
        body: JSON.stringify({
          name: newKeyName,
          environment,
          rate_limit_rpm: rateLimitRpm,
          project_id: targetProjectId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to create API key');
      }

      setIsCreateOpen(false);
      setNewKeyName('');
      // Reveal raw key ONCE in modal
      setRevealedKey({ rawKey: data.rawKey, name: data.apiKey.name });
      onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Applications using it will immediately be rejected.')) {
      return;
    }
    try {
      await fetch(`/api/v1/api-keys/${id}`, {
        method: 'DELETE',
        headers: { 'x-internal-admin': 'true' },
      });
      onRefresh();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">API Key Management</h2>
          <p className="text-xs text-slate-400">
            Generate and revoke scoped credentials for external servers, microservices, and apps.
          </p>
        </div>
        <button
          onClick={() => {
            setTargetProjectId(activeProject?.id || projects[0]?.id || '');
            setIsCreateOpen(true);
          }}
          className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
        >
          <Plus className="w-4 h-4" />
          Generate New API Key
        </button>
      </div>

      {/* Security Advisory Card */}
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 flex items-start gap-3 text-xs text-amber-200">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-amber-300">Salted SHA-256 Storage Guarantee</div>
          <p className="text-slate-300 leading-relaxed text-[11px]">
            Raw keys are never stored in plaintext on disk or in the database. When you generate a key, it is displayed once. Keep keys secure and never commit them to client-side frontend code or public repositories.
          </p>
        </div>
      </div>

      {/* Keys Table */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 font-semibold">
                <th className="py-3 px-4">Key Name</th>
                <th className="py-3 px-4">Prefix Token</th>
                <th className="py-3 px-4">Environment</th>
                <th className="py-3 px-4">Rate Limit</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Used</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {apiKeys.map((key) => {
                const isActive = key.status === 'active';
                const isProd = key.environment === 'production';
                return (
                  <tr key={key.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-200 flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                      {key.name}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {key.key_prefix}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                          isProd
                            ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {key.environment}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-medium">
                      {key.rate_limit_rpm} RPM
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded border ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {key.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Never'}
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {new Date(key.created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isActive && (
                        <button
                          onClick={() => handleRevokeKey(key.id)}
                          className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Key Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-cyan-400" />
                Generate Project API Key
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Key Name *</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Mobile App Backend, Production Worker"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Project</label>
                <select
                  value={targetProjectId}
                  onChange={(e) => setTargetProjectId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Environment</label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="production">Production (ua_live_)</option>
                    <option value="development">Development (ua_test_)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Rate Limit (RPM)</label>
                  <input
                    type="number"
                    min="5"
                    max="1000"
                    value={rateLimitRpm}
                    onChange={(e) => setRateLimitRpm(parseInt(e.target.value) || 60)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-cyan-500/20"
                >
                  {isSubmitting ? 'Generating...' : 'Generate API Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Secret Reveal Modal (Shown ONCE) */}
      {revealedKey && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-amber-500/40 rounded-2xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <div>
                <h3 className="font-bold text-base text-white">Save Your API Key Now</h3>
                <p className="text-xs text-amber-300/90">
                  This key will NEVER be shown again. Store it securely in your server environment.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="text-[11px] font-semibold text-slate-400">{revealedKey.name}</div>
              <div className="flex items-center justify-between gap-2 font-mono text-xs text-cyan-300 break-all select-all">
                <span>{revealedKey.rawKey}</span>
                <button
                  onClick={() => copyToClipboard(revealedKey.rawKey)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 shrink-0 font-sans font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="text-right">
              <button
                onClick={() => setRevealedKey(null)}
                className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer shadow-md shadow-cyan-500/20"
              >
                I have copied my key securely
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
