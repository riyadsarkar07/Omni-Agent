'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Agent, ApiKey, Project, UsageLog, User } from '@/lib/types';
import { apiFetch } from '@/lib/auth/session-client';
import { Header } from '@/components/layout/Header';
import { ProjectsView } from '@/components/dashboard/ProjectsView';
import { AgentsView } from '@/components/dashboard/AgentsView';
import { PlaygroundView } from '@/components/dashboard/PlaygroundView';
import { ApiKeysView } from '@/components/dashboard/ApiKeysView';
import { ConversationsView } from '@/components/dashboard/ConversationsView';
import { AnalyticsView } from '@/components/dashboard/AnalyticsView';
import { DocsView } from '@/components/dashboard/DocsView';
import { SettingsView } from '@/components/dashboard/SettingsView';
import { ProvidersView } from '@/components/dashboard/ProvidersView';
import {
  SystemOverviewView,
  UserDirectoryView,
  SystemHealthView,
  SystemAuditView,
  ModelsCatalogView,
} from '@/components/dashboard/admin';
import {
  LayoutDashboard,
  Users,
  Server,
  Bot,
  FolderGit2,
  KeyRound,
  MessagesSquare,
  BarChart3,
  Activity,
  Lock,
  Settings,
  PlaySquare,
  BookOpen,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';

export type AdminTab =
  | 'dashboard'
  | 'users'
  | 'providers'
  | 'models'
  | 'agents'
  | 'projects'
  | 'api-keys'
  | 'conversations'
  | 'analytics'
  | 'health'
  | 'audit'
  | 'settings'
  | 'playground'
  | 'docs';

interface AdminConsoleProps {
  currentUser: User;
}

const NAV: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'providers', label: 'Providers', icon: Server },
  { id: 'models', label: 'Models', icon: Activity },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'api-keys', label: 'API Keys', icon: KeyRound },
  { id: 'conversations', label: 'Conversations', icon: MessagesSquare },
  { id: 'analytics', label: 'Usage & Analytics', icon: BarChart3 },
  { id: 'health', label: 'System Health', icon: Activity },
  { id: 'audit', label: 'Audit & Security', icon: Lock },
  { id: 'playground', label: 'Playground', icon: PlaySquare },
  { id: 'docs', label: 'Docs', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const AdminConsole: React.FC<AdminConsoleProps> = ({ currentUser }) => {
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);
  const [usageSummary, setUsageSummary] = useState({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTokens: 0,
    promptTokens: 0,
    candidateTokens: 0,
    avgLatencyMs: 0,
    recentLogs: [] as UsageLog[],
  });

  const refreshData = useCallback(async () => {
    const [projRes, agentsRes, keysRes, usageRes, healthRes] = await Promise.all([
      apiFetch('/api/v1/projects'),
      apiFetch('/api/v1/agents'),
      apiFetch('/api/v1/api-keys'),
      apiFetch('/api/v1/usage'),
      apiFetch('/api/v1/health'),
    ]);
    if (projRes.ok) {
      const data = await projRes.json();
      const list = data.projects || [];
      setProjects(list);
      setActiveProject((prev) => prev || list[0] || null);
    }
    if (agentsRes.ok) {
      const data = await agentsRes.json();
      setAgents(data.agents || []);
    }
    if (keysRes.ok) {
      const data = await keysRes.json();
      setApiKeys(data.apiKeys || []);
    }
    if (usageRes.ok) {
      const data = await usageRes.json();
      setUsageSummary({
        totalRequests: data.summary?.totalRequests || 0,
        successfulRequests: data.summary?.successfulRequests || 0,
        failedRequests: data.summary?.failedRequests || 0,
        totalTokens: data.summary?.totalTokens || 0,
        promptTokens: data.summary?.promptTokens || 0,
        candidateTokens: data.summary?.candidateTokens || 0,
        avgLatencyMs: data.summary?.avgLatencyMs || 0,
        recentLogs: data.recentLogs || [],
      });
    }
    if (healthRes.ok) {
      const health = await healthRes.json();
      setIsSupabaseConnected(health.database?.adapter === 'supabase-postgresql');
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        await refreshData();
      } catch {
        if (ignore) return;
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [refreshData]);

  const sidebar = (
    <div className="flex flex-col h-full bg-zinc-950/90">
      <div className="h-14 px-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <div>
            <div className="text-sm font-bold text-white">OmniAgent</div>
            <div className="text-[10px] text-purple-300 uppercase tracking-wider">Admin Console</div>
          </div>
        </div>
        <button type="button" className="lg:hidden p-1.5 text-zinc-400" onClick={() => setSidebarOpen(false)}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                active ? 'bg-purple-500/10 text-purple-300 border border-purple-500/20' : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/5">
        <a href="/workspace" className="block text-center text-xs font-semibold rounded-xl py-2 bg-white/5 text-cyan-300 hover:bg-white/10">
          Open User Workspace
        </a>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-main)] text-slate-100">
      <aside className="hidden lg:flex w-64 border-r border-white/5 shrink-0">{sidebar}</aside>
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 h-full border-r border-white/10">{sidebar}</div>
        </div>
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          projects={projects}
          activeProject={activeProject}
          onSelectProject={setActiveProject}
          onOpenPlayground={() => setTab('playground')}
          isSupabaseConnected={isSupabaseConnected}
          currentUser={currentUser}
          onOpenAuthModal={() => {}}
          onMenuToggle={() => setSidebarOpen(true)}
          isAdminMode
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {tab === 'dashboard' && <SystemOverviewView />}
          {tab === 'users' && <UserDirectoryView />}
          {tab === 'providers' && <ProvidersView />}
          {tab === 'models' && <ModelsCatalogView />}
          {tab === 'agents' && (
            <AgentsView
              agents={agents}
              projects={projects}
              activeProject={activeProject}
              onRefresh={refreshData}
              onTestInPlayground={() => setTab('playground')}
            />
          )}
          {tab === 'projects' && (
            <ProjectsView
              projects={projects}
              agents={agents}
              apiKeys={apiKeys}
              activeProject={activeProject}
              onSelectProject={setActiveProject}
              onRefresh={refreshData}
            />
          )}
          {tab === 'api-keys' && (
            <ApiKeysView apiKeys={apiKeys} projects={projects} activeProject={activeProject} onRefresh={refreshData} />
          )}
          {tab === 'conversations' && <ConversationsView activeProject={activeProject} agents={agents} />}
          {tab === 'analytics' && <AnalyticsView usageSummary={usageSummary} activeProject={activeProject} />}
          {tab === 'health' && <SystemHealthView />}
          {tab === 'audit' && <SystemAuditView />}
          {tab === 'settings' && <SettingsView isSupabaseConnected={isSupabaseConnected} />}
          {tab === 'playground' && (
            <PlaygroundView agents={agents} activeProject={activeProject} onRefreshAgents={refreshData} />
          )}
          {tab === 'docs' && <DocsView />}
        </main>
      </div>
    </div>
  );
};
