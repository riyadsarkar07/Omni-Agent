'use client';

import React, { useState } from 'react';
import { ApiKey, Project } from '@/lib/types';
import { apiFetch } from '@/lib/auth/session-client';
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
      const res = await apiFetch('/api/v1/api-keys', {
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
      await apiFetch(`/api/v1/api-keys/${id}`, {
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
          <h2 className="text-2xl font-extrabold tracking-tight text-white">API Key Management</h2>
          <p className="text-sm text-zinc-400">
            Generate and revoke scoped credentials for external servers, microservices, and apps.
          </p>
        </div>
        <button
          onClick={() => {
            setTargetProjectId(activeProject?.id || projects[0]?.id || '');
            setIsCreateOpen(true);
          }}
          className="px-6 py-2 rounded-xl bg-white text-zinc-950 font-bold text-sm flex items-center gap-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Generate New API Key
        </button>
      </div>

      {/* Security Advisory Card */}
      <div className="glass-card rounded-2xl p-6 border border-white/5 flex items-start gap-4 text-sm text-zinc-300">
        <ShieldAlert className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-white">Salted SHA-256 Storage Guarantee</div>
          <p className="text-zinc-400 leading-relaxed">
            Raw keys are never stored in plaintext on disk or in the database. When you generate a key, it is displayed once. Keep keys secure and never commit them to client-side frontend code or public repositories.
          </p>
        </div>
      </div>

      {/* Keys Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs divide-y divide-white/5">
            <thead>
              <tr className="bg-zinc-900/50 text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="py-4 px-6">Key Name</th>
                <th className="py-4 px-6">Prefix Token</th>
                <th className="py-4 px-6">Environment</th>
                <th className="py-4 px-6">Rate Limit</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Last Used</th>
                <th className="py-4 px-6">Created</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {apiKeys.map((key) => {
                const isActive = key.status === 'active';
                const isProd = key.environment === 'production';
                return (
                  <tr key={key.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 px-6 font-medium text-white flex items-center gap-3">
                      <KeyRound className="w-4 h-4 text-zinc-500" />
                      {key.name}
                    </td>
                    <td className="py-4 px-6 font-mono text-zinc-400">
                      {key.key_prefix}
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                          isProd
                            ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        {key.environment}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-zinc-300">
                      {key.rate_limit_rpm} RPM
                    </td>
                    <td className="py-4 px-6">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        }`}
                      >
                        {isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {key.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-zinc-400">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Never'}
                    </td>
                    <td className="py-4 px-6 text-zinc-400">
                      {new Date(key.created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {isActive && (
                        <button
                          onClick={() => handleRevokeKey(key.id)}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition-colors cursor-pointer"
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
          <div className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h3 className="font-bold text-lg text-white flex items-center gap-3">
                <KeyRound className="w-5 h-5 text-white" />
                Generate Project API Key
              </h3>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateKey} className="space-y-4">
              {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-300">Key Name *</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. Mobile App Backend, Production Worker"
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-zinc-300">Project</label>
                <select
                  value={targetProjectId}
                  onChange={(e) => setTargetProjectId(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-300">Environment</label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20"
                  >
                    <option value="production">Production (ua_live_)</option>
                    <option value="development">Development (ua_test_)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-zinc-300">Rate Limit (RPM)</label>
                  <input
                    type="number"
                    min="5"
                    max="1000"
                    value={rateLimitRpm}
                    onChange={(e) => setRateLimitRpm(parseInt(e.target.value) || 60)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-white/20"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-white text-zinc-950 text-sm font-bold transition-all disabled:opacity-40 cursor-pointer"
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
          <div className="w-full max-w-lg bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl p-8 space-y-6">
            <div className="flex items-center gap-4 text-amber-500">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <div>
                <h3 className="font-bold text-lg text-white">Save Your API Key Now</h3>
                <p className="text-sm text-zinc-400">
                  This key will NEVER be shown again. Store it securely in your server environment.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900 border border-white/5 space-y-3">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{revealedKey.name}</div>
              <div className="flex items-center justify-between gap-4 font-mono text-sm text-white bg-black/50 p-4 rounded-xl border border-white/5">
                <span className="break-all">{revealedKey.rawKey}</span>
                <button
                  onClick={() => copyToClipboard(revealedKey.rawKey)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 shrink-0 font-sans font-semibold text-xs flex items-center gap-2 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="text-right">
              <button
                onClick={() => setRevealedKey(null)}
                className="px-6 py-2.5 rounded-xl bg-white text-zinc-950 font-bold text-sm cursor-pointer"
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
