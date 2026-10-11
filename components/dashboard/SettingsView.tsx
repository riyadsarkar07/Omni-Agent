'use client';

import React, { useEffect, useState } from 'react';
import {
  Settings,
  Database,
  CheckCircle2,
  Copy,
  Check,
  Server,
  FileCode2,
  Route,
} from 'lucide-react';
import { apiFetch } from '@/lib/auth/session-client';
import { DEFAULT_ROUTING_SETTINGS, type RoutingSettings } from '@/lib/providers/routing-policy';
import { AIProvider } from '@/lib/providers/types';

interface SettingsViewProps {
  isSupabaseConnected: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ isSupabaseConnected }) => {
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [geminiConnectivity, setGeminiConnectivity] = useState('not-probed');
  const [databaseStatus, setDatabaseStatus] = useState(isSupabaseConnected ? 'connected' : 'in-memory');
  const [copiedMigration, setCopiedMigration] = useState(false);
  const [defaultModel, setDefaultModel] = useState('gemini-3.8-flash');
  const [adminContactEmail, setAdminContactEmail] = useState('');
  const [routing, setRouting] = useState<RoutingSettings>({ ...DEFAULT_ROUTING_SETTINGS });
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      apiFetch('/api/v1/admin/settings'),
      apiFetch('/api/v1/health'),
      apiFetch('/api/v1/providers').catch(() => null),
    ])
      .then(async ([settingsRes, healthRes, providersRes]) => {
        const settingsData = await settingsRes.json().catch(() => ({}));
        const healthData = await healthRes.json().catch(() => ({}));
        const providerData = providersRes ? await providersRes.json().catch(() => ({ providers: [] })) : { providers: [] };
        if (ignore) return;
        if (settingsRes.ok) {
          if (settingsData.settings?.default_model) setDefaultModel(settingsData.settings.default_model);
          if (settingsData.settings?.admin_contact_email) setAdminContactEmail(settingsData.settings.admin_contact_email);
          if (settingsData.settings?.routing) setRouting({ ...DEFAULT_ROUTING_SETTINGS, ...settingsData.settings.routing });
        }
        if (healthRes.ok) {
          setGeminiConfigured(Boolean(healthData.gemini_engine?.configured));
          setGeminiConnectivity(healthData.gemini_engine?.connectivity || 'not-probed');
          setDatabaseStatus(healthData.database?.status || (isSupabaseConnected ? 'connected' : 'in-memory'));
        }
        if (Array.isArray(providerData.providers)) setProviders(providerData.providers);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [isSupabaseConnected]);

  const sampleMigrationSql = `-- Universal AI Agent Platform Supabase Migration
-- Run in Supabase SQL Editor:
-- Tables: profiles, projects, project_members, agents, api_keys, conversations, messages, usage_logs, agent_tools, audit_logs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- (See /supabase/migrations/20260101_initial_schema.sql for the complete 10-table schema & RLS policies)
`;

  const copyMigration = () => {
    navigator.clipboard.writeText(sampleMigrationSql);
    setCopiedMigration(true);
    setTimeout(() => setCopiedMigration(false), 2000);
  };

  const handleSaveDefaults = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSavedSuccess(false);
    try {
      const res = await apiFetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_model: defaultModel,
          admin_contact_email: adminContactEmail || null,
          routing,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to save settings');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: unknown) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Platform Configuration & Status</h2>
        <p className="text-xs text-slate-400">
          Inspect backend status, database engine, Gemini API keys, and enterprise security policies.
        </p>
      </div>

      {/* Engine & Database Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gemini Engine */}
        <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Server className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Google Gemini Engine</h3>
                <div className="text-[10px] text-slate-400">Official @google/genai SDK v2.4</div>
              </div>
            </div>

            <span className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
              geminiConfigured
                ? 'text-amber-300 bg-amber-500/10 border-amber-500/20'
                : 'text-zinc-400 bg-zinc-800 border-zinc-700'
            }`}>
              <CheckCircle2 className="w-3 h-3" />
              {geminiConfigured ? 'Configured' : 'Unconfigured'}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {geminiConfigured
              ? `Gemini API key is present on the server. Live connectivity: ${geminiConnectivity}. Use Providers to run a real connection test.`
              : 'GEMINI_API_KEY is not set. Chat will fail until a provider key is configured.'}
          </p>

          <div className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <span>GEMINI_API_KEY</span>
            <span className={geminiConfigured ? 'text-amber-300 font-semibold' : 'text-zinc-500 font-semibold'}>
              {geminiConfigured ? 'Present (not probed)' : 'Missing'}
            </span>
          </div>
        </div>

        {/* Database Engine */}
        <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                  isSupabaseConnected
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                }`}
              >
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Database Adapter</h3>
                <div className="text-[10px] text-slate-400">
                  {isSupabaseConnected ? 'Supabase PostgreSQL Cloud' : 'Resilient In-Memory DB'}
                </div>
              </div>
            </div>

            <span
              className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                databaseStatus === 'connected'
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : databaseStatus === 'unreachable' || databaseStatus === 'unconfigured'
                    ? 'text-rose-300 bg-rose-500/10 border-rose-500/20'
                    : 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              {databaseStatus}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {isSupabaseConnected
              ? 'Connected to your remote Supabase instance with Row Level Security (RLS) enforcement.'
              : 'Operating with zero-setup resilient storage. To connect external Supabase, configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'}
          </p>

          <div className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <span>Schema Status</span>
            <span className="text-cyan-400 font-semibold">10 Tables Defined</span>
          </div>
        </div>
      </div>

      {/* Supabase SQL Migration Blueprint */}
      <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-4 h-4 text-cyan-400" />
            <h3 className="font-bold text-sm text-white">Supabase PostgreSQL Migration</h3>
          </div>
          <button
            onClick={copyMigration}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copiedMigration ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedMigration ? 'SQL Copied!' : 'Copy Migration SQL'}
          </button>
        </div>

        <p className="text-xs text-slate-300">
          The full migration script is located at <code className="text-cyan-300 font-mono">/supabase/migrations/20260101_initial_schema.sql</code>. It includes all 10 tables, triggers, indexes, and Row Level Security policies.
        </p>

        <div className="rounded-lg bg-slate-950 p-3 font-mono text-[11px] text-slate-400 border border-slate-800 overflow-x-auto">
          <code>
            profiles • projects • project_members • agents • api_keys • conversations • messages • usage_logs • agent_tools • audit_logs
          </code>
        </div>
      </div>

      {/* Default Model Preferences */}
      <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <Settings className="w-4 h-4 text-cyan-400" />
          Default Agent Preferences
        </h3>

        <form onSubmit={handleSaveDefaults} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Default Model</label>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="w-full bg-zinc-900 border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20 cursor-pointer"
              >
                <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended Workhorse)</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Reasoning & Coding)</option>
                <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Ultra-Low Latency)</option>
                <option value="gemini-3.8-flash">Gemini 3.8 Flash (General Tasks)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Admin Contact Email</label>
              <input
                type="email"
                value={adminContactEmail}
                onChange={(e) => setAdminContactEmail(e.target.value)}
                placeholder="admin@your-domain.example"
                className="w-full bg-zinc-900 border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/20"
              />
            </div>
          </div>

          <div className="border-t border-white/5 pt-4 space-y-4">
            <h4 className="font-bold text-sm text-white flex items-center gap-2">
              <Route className="w-4 h-4 text-cyan-400" />
              Smart Routing
            </h4>
            <p className="text-[11px] text-zinc-500">
              Explicit playground or API provider/model always wins. Auto only runs when enabled here and the client chooses Auto.
            </p>
            <label className="flex min-h-12 items-center justify-between rounded-xl border border-white/5 bg-zinc-950/50 px-4">
              <span>
                <span className="block text-xs font-semibold text-zinc-200">Enable Auto routing</span>
                <span className="text-[10px] text-zinc-500">Pick a healthy provider only when Auto is selected</span>
              </span>
              <input
                type="checkbox"
                checked={routing.autoRoutingEnabled}
                onChange={(e) => setRouting((prev) => ({ ...prev, autoRoutingEnabled: e.target.checked }))}
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
            <label className="flex min-h-12 items-center justify-between rounded-xl border border-white/5 bg-zinc-950/50 px-4">
              <span>
                <span className="block text-xs font-semibold text-zinc-200">Enable fallback</span>
                <span className="text-[10px] text-zinc-500">Off by default. Does not switch after the first stream token</span>
              </span>
              <input
                type="checkbox"
                checked={routing.fallbackEnabled}
                onChange={(e) => setRouting((prev) => ({ ...prev, fallbackEnabled: e.target.checked }))}
                className="h-4 w-4 accent-cyan-500"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Preferred provider</label>
                <select
                  value={routing.preferredProviderId || ''}
                  onChange={(e) => setRouting((prev) => ({ ...prev, preferredProviderId: e.target.value || null }))}
                  className="w-full bg-zinc-900 border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none"
                >
                  <option value="">None</option>
                  {providers.filter((p) => p.enabled).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Preferred model</label>
                <input
                  value={routing.preferredModel || ''}
                  onChange={(e) => setRouting((prev) => ({ ...prev, preferredModel: e.target.value || null }))}
                  placeholder="optional model id"
                  className="w-full bg-zinc-900 border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Max retries</label>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={routing.maxRetries}
                  onChange={(e) => setRouting((prev) => ({ ...prev, maxRetries: Number(e.target.value) }))}
                  className="w-full bg-zinc-900 border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Request timeout (ms)</label>
                <input
                  type="number"
                  min={1000}
                  max={120000}
                  value={routing.requestTimeoutMs}
                  onChange={(e) => setRouting((prev) => ({ ...prev, requestTimeoutMs: Number(e.target.value) }))}
                  className="w-full bg-zinc-900 border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none"
                />
              </div>
            </div>
            {routing.fallbackEnabled && (
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Fallback candidates</label>
                {(routing.fallbackCandidates.length ? routing.fallbackCandidates : [{ providerId: '', model: '' }]).map((item, index) => (
                  <div key={`${item.providerId}-${index}`} className="grid grid-cols-2 gap-2">
                    <select
                      value={item.providerId}
                      onChange={(e) => {
                        const next = [...routing.fallbackCandidates];
                        if (!next[index]) next[index] = { providerId: '', model: '' };
                        next[index] = { ...next[index], providerId: e.target.value };
                        setRouting((prev) => ({ ...prev, fallbackCandidates: next.filter((c) => c.providerId) }));
                      }}
                      className="w-full bg-zinc-900 border-white/10 rounded-xl px-3 py-2 text-xs"
                    >
                      <option value="">Select provider</option>
                      {providers.filter((p) => p.enabled).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      value={item.model || ''}
                      onChange={(e) => {
                        const next = [...(routing.fallbackCandidates.length ? routing.fallbackCandidates : [{ providerId: '', model: '' }])];
                        next[index] = { ...(next[index] || { providerId: '' }), model: e.target.value };
                        setRouting((prev) => ({ ...prev, fallbackCandidates: next }));
                      }}
                      placeholder="optional model"
                      className="w-full bg-zinc-900 border-white/10 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setRouting((prev) => ({ ...prev, fallbackCandidates: [...prev.fallbackCandidates, { providerId: '', model: '' }] }))}
                  className="text-[11px] text-cyan-400 font-semibold"
                >
                  Add fallback candidate
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            {savedSuccess ? (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Preferences saved
              </span>
            ) : saveError ? (
              <span className="text-xs text-rose-400 font-semibold">{saveError}</span>
            ) : <span />}

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-md shadow-cyan-500/20 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
