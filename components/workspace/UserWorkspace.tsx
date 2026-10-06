'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Agent, Conversation, Project, UsageLog, User } from '@/lib/types';
import { apiFetch } from '@/lib/auth/session-client';
import { PlaygroundView } from '@/components/dashboard/PlaygroundView';
import { UserAgentsView } from './UserAgentsView';
import { UserProjectsView } from './UserProjectsView';
import { UserUsageView } from './UserUsageView';
import { UserSettingsView } from './UserSettingsView';
import { groupConversations } from '@/lib/conversations/group';
import {
  Menu,
  Plus,
  Search,
  MessageSquare,
  Bot,
  FolderGit2,
  BarChart3,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
  Pencil,
  Trash2,
} from 'lucide-react';

export type WorkspaceTab = 'chat' | 'agents' | 'projects' | 'usage' | 'settings';

interface UserWorkspaceProps {
  currentUser: User;
  onUserUpdated: (user: User) => void;
  onLogout: () => void;
}

export const UserWorkspace: React.FC<UserWorkspaceProps> = ({
  currentUser,
  onUserUpdated,
  onLogout,
}) => {
  const [tab, setTab] = useState<WorkspaceTab>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [usageSummary, setUsageSummary] = useState({
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTokens: 0,
    avgLatencyMs: 0,
    recentLogs: [] as UsageLog[],
  });
  const [chatKey, setChatKey] = useState(0);

  const loadWorkspace = useCallback(async () => {
    const [projRes, agentsRes, convRes, usageRes] = await Promise.all([
      apiFetch('/api/v1/projects'),
      apiFetch('/api/v1/agents'),
      apiFetch('/api/v1/conversations'),
      apiFetch('/api/v1/usage'),
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
    if (convRes.ok) {
      const data = await convRes.json();
      setConversations(data.conversations || []);
    }
    if (usageRes.ok) {
      const data = await usageRes.json();
      setUsageSummary({
        totalRequests: data.summary?.totalRequests || 0,
        successfulRequests: data.summary?.successfulRequests || 0,
        failedRequests: data.summary?.failedRequests || 0,
        totalTokens: data.summary?.totalTokens || 0,
        avgLatencyMs: data.summary?.avgLatencyMs || 0,
        recentLogs: data.recentLogs || [],
      });
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        await loadWorkspace();
      } catch {
        if (ignore) return;
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [loadWorkspace]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const grouped = useMemo(() => groupConversations(filteredConversations), [filteredConversations]);

  const handleNewChat = () => {
    setChatKey((k) => k + 1);
    setTab('chat');
    setSidebarOpen(false);
  };

  const handleRename = async (conversation: Conversation) => {
    const next = window.prompt('Rename conversation', conversation.title);
    if (!next || next.trim() === conversation.title) return;
    const res = await apiFetch(`/api/v1/conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: next.trim() }),
    });
    if (res.ok) {
      setConversations((prev) =>
        prev.map((c) => (c.id === conversation.id ? { ...c, title: next.trim() } : c))
      );
    }
  };

  const handleDelete = async (conversation: Conversation) => {
    if (!window.confirm('Delete this conversation?')) return;
    const res = await apiFetch(`/api/v1/conversations/${conversation.id}`, { method: 'DELETE' });
    if (res.ok) {
      setConversations((prev) => prev.filter((c) => c.id !== conversation.id));
    }
  };

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: typeof Bot }> = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'agents', label: 'My Agents', icon: Bot },
    { id: 'projects', label: 'Projects', icon: FolderGit2 },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const sidebar = (
    <div className="flex flex-col h-full bg-zinc-950/90">
      <div className="h-14 px-4 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="font-bold text-sm text-white">OmniAgent</span>
        </div>
        <button
          type="button"
          className="lg:hidden p-1.5 text-zinc-400"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <button
          type="button"
          onClick={handleNewChat}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-zinc-950 text-xs font-bold py-2.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New Chat
        </button>
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations"
            className="w-full bg-zinc-900 border border-white/5 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-4">
        {(['Today', 'Yesterday', 'Older'] as const).map((label) =>
          grouped[label].length ? (
            <div key={label}>
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
              <div className="space-y-0.5">
                {grouped[label].map((c) => (
                  <div
                    key={c.id}
                    className="group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-white/5"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setTab('chat');
                        setSidebarOpen(false);
                      }}
                      className="flex-1 text-left text-xs text-zinc-300 truncate cursor-pointer"
                    >
                      {c.title}
                    </button>
                    <button type="button" onClick={() => handleRename(c)} className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-white cursor-pointer">
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button type="button" onClick={() => handleDelete(c)} className="opacity-0 group-hover:opacity-100 p-1 text-zinc-500 hover:text-rose-400 cursor-pointer">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )}
      </div>

      <nav className="border-t border-white/5 p-2 space-y-0.5">
        {navItems.map((item) => {
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
                active ? 'bg-cyan-500/10 text-cyan-300' : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
        {currentUser.role === 'admin' && (
          <a
            href="/admin"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-purple-300 hover:bg-purple-500/10"
          >
            <ShieldCheck className="w-4 h-4" />
            Admin Console
          </a>
        )}
      </nav>

      <div className="p-3 border-t border-white/5">
        <div className="flex items-center gap-2 text-xs text-zinc-300">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center font-bold text-white">
            {(currentUser.full_name || currentUser.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{currentUser.full_name || 'Account'}</div>
            <div className="truncate text-[10px] text-zinc-500">{currentUser.email}</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-main)] text-slate-100">
      <aside className="hidden lg:flex w-72 border-r border-white/5 shrink-0">{sidebar}</aside>
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-72 h-full border-r border-white/10">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-white/5 px-3 md:px-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg bg-white/5 border border-white/10 text-zinc-400 cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="text-sm font-semibold text-white">
            {tab === 'chat' ? 'Chat' : tab === 'agents' ? 'My Agents' : tab === 'projects' ? 'Projects' : tab === 'usage' ? 'Usage' : 'Settings'}
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-hidden">
          {tab === 'chat' && (
            <div className="h-full p-2 md:p-4 overflow-hidden">
              <PlaygroundView key={chatKey} agents={agents} activeProject={activeProject} onRefreshAgents={loadWorkspace} />
            </div>
          )}
          {tab === 'agents' && (
            <div className="h-full overflow-y-auto">
              <UserAgentsView agents={agents} onOpenChat={() => setTab('chat')} />
            </div>
          )}
          {tab === 'projects' && (
            <div className="h-full overflow-y-auto">
              <UserProjectsView
                projects={projects}
                agents={agents}
                activeProject={activeProject}
                onSelectProject={setActiveProject}
              />
            </div>
          )}
          {tab === 'usage' && (
            <div className="h-full overflow-y-auto">
              <UserUsageView usageSummary={usageSummary} />
            </div>
          )}
          {tab === 'settings' && (
            <div className="h-full overflow-y-auto">
              <UserSettingsView currentUser={currentUser} onUserUpdated={onUserUpdated} onLogout={onLogout} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
