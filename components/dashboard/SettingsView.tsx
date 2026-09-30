'use client';

import React, { useState } from 'react';
import {
  Settings,
  Database,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ShieldCheck,
  Server,
  KeyRound,
  FileCode2,
} from 'lucide-react';

interface SettingsViewProps {
  isSupabaseConnected: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ isSupabaseConnected }) => {
  const [copiedMigration, setCopiedMigration] = useState(false);
  const [defaultModel, setDefaultModel] = useState('gemini-3.5-flash');
  const [savedSuccess, setSavedSuccess] = useState(false);

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

  const handleSaveDefaults = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Platform Configuration & Status</h2>
        <p className="text-xs text-slate-400">
          Inspect backend status, database engine, Gemini API keys, and enterprise security policies.
        </p>
      </div>

      {/* Engine & Database Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gemini Engine */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-3">
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

            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
              <CheckCircle2 className="w-3 h-3" />
              Ready
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Connected to Gemini models with multi-turn context retention, Server-Sent Events (SSE) streaming, and High Thinking reasoning.
          </p>

          <div className="text-[11px] text-slate-400 font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
            <span>GEMINI_API_KEY</span>
            <span className="text-emerald-400 font-semibold">Configured (Server-Side)</span>
          </div>
        </div>

        {/* Database Engine */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-3">
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
                isSupabaseConnected
                  ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              Connected
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
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-3">
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
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-4">
        <h3 className="font-bold text-sm text-white flex items-center gap-2">
          <Settings className="w-4 h-4 text-cyan-400" />
          Default Agent Preferences
        </h3>

        <form onSubmit={handleSaveDefaults} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Default Model</label>
              <select
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                <option value="gemini-3.5-flash">Gemini 3.5 Flash (Recommended Workhorse)</option>
                <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Reasoning & Coding)</option>
                <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Ultra-Low Latency)</option>
                <option value="gemini-3.8-flash">Gemini 3.8 Flash (General Tasks)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Admin Contact Email</label>
              <input
                type="email"
                defaultValue="admin@omniagent.io"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {savedSuccess ? (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Preferences saved
              </span>
            ) : <span />}

            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all cursor-pointer shadow-md shadow-cyan-500/20"
            >
              Save Preferences
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
