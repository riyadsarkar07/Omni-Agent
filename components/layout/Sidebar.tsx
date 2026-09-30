'use client';

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  FolderGit2,
  Bot,
  PlaySquare,
  KeyRound,
  MessagesSquare,
  BarChart3,
  BookOpen,
  Settings,
  Sparkles,
  Server,
  ShieldCheck,
  Users,
  Activity,
  Zap,
  Lock,
  X,
  ChevronRight,
} from 'lucide-react';
import { User } from '@/lib/types';

export type DashboardTab =
  | 'overview'
  | 'projects'
  | 'agents'
  | 'playground'
  | 'api-keys'
  | 'conversations'
  | 'analytics'
  | 'docs'
  | 'settings'
  | 'providers'
  // Admin Tabs
  | 'admin-overview'
  | 'admin-users'
  | 'admin-health'
  | 'admin-security';

interface SidebarProps {
  currentTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  agentCount: number;
  projectCount: number;
  apiKeyCount: number;
  currentUser?: User | null;
  isAdminMode?: boolean;
  onToggleAdminMode?: (isAdmin: boolean) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  id: DashboardTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  isSpecial?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  agentCount,
  projectCount,
  apiKeyCount,
  currentUser,
  isAdminMode = false,
  onToggleAdminMode,
  isOpen = false,
  onClose,
}) => {
  const isUserAdmin = currentUser?.role === 'admin';

  const userNavItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderGit2, badge: projectCount },
    { id: 'agents', label: 'Agents', icon: Bot, badge: agentCount },
    { id: 'playground', label: 'Playground', icon: PlaySquare, isSpecial: true },
    { id: 'api-keys', label: 'API Keys', icon: KeyRound, badge: apiKeyCount },
    { id: 'providers', label: 'AI Providers', icon: Server },
    { id: 'conversations', label: 'Conversations', icon: MessagesSquare },
    { id: 'analytics', label: 'Usage & Analytics', icon: BarChart3 },
    { id: 'docs', label: 'API & SDK Docs', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const adminNavItems: NavItem[] = [
    { id: 'admin-overview', label: 'System Overview', icon: Activity },
    { id: 'admin-users', label: 'User Directory', icon: Users },
    { id: 'providers', label: 'Global Providers', icon: Server },
    { id: 'admin-health', label: 'System Health', icon: Zap },
    { id: 'analytics', label: 'Global Telemetry', icon: BarChart3 },
    { id: 'admin-security', label: 'Audit & Security', icon: Lock },
    { id: 'settings', label: 'Admin Settings', icon: Settings },
  ];

  const currentNavItems = isAdminMode ? adminNavItems : userNavItems;

  const renderSidebarContent = (closeMenu?: () => void) => (
    <div className="flex flex-col justify-between h-full w-full bg-zinc-950/80 backdrop-blur-xl">
      <div className="flex-1 overflow-y-auto">
        {/* Brand Header */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-zinc-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                OmniAgent
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded tracking-wider uppercase border ${
                  isAdminMode
                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                    : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                }`}>
                  {isAdminMode ? 'ADMIN' : 'PRO'}
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 font-medium">
                {isAdminMode ? 'Operations Console' : 'Universal AI Platform'}
              </div>
            </div>
          </div>
        </div>

        {/* Mode Switcher for Admins */}
        {isUserAdmin && onToggleAdminMode && (
          <div className="p-3 border-b border-white/5 bg-zinc-900/30">
            <div className="flex rounded-lg bg-zinc-900 border border-white/5 p-1 gap-1">
              <button
                onClick={() => {
                  onToggleAdminMode(false);
                  onSelectTab('overview');
                  if (closeMenu) closeMenu();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  !isAdminMode
                    ? 'bg-zinc-800 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Bot className="w-3 h-3 text-cyan-400" />
                Workspace
              </button>
              <button
                onClick={() => {
                  onToggleAdminMode(true);
                  onSelectTab('admin-overview');
                  if (closeMenu) closeMenu();
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  isAdminMode
                    ? 'bg-purple-950/60 text-purple-300 border border-purple-500/30 shadow-sm'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ShieldCheck className="w-3 h-3 text-purple-400" />
                Console
              </button>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            {isAdminMode ? 'Operations & Governance' : 'Workspace Navigation'}
          </div>
          {currentNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id as DashboardTab);
                  if (closeMenu) closeMenu();
                }}
                className={`w-full relative flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  isActive
                    ? isAdminMode
                      ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                      : 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? isAdminMode
                          ? 'text-purple-400'
                          : 'text-cyan-400'
                        : item.isSpecial
                        ? 'text-indigo-400'
                        : 'text-zinc-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
                {item.isSpecial && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                    Live
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-white/5 bg-zinc-950/40">
        <div className="rounded-xl bg-zinc-900/60 border border-white/5 p-3 space-y-1.5">
          <div className="text-[11px] font-bold text-zinc-300 flex items-center justify-between">
            <span>Gemini 2.4 & Multi-LLM</span>
            <span className="text-[10px] text-emerald-400 font-mono">ONLINE</span>
          </div>
          <p className="text-[10px] text-zinc-500 leading-relaxed font-medium">
            Multi-turn conversation retention, tool calling, and high-thinking reasoning engine.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-white/5 bg-zinc-950/60 flex-col justify-between shrink-0 select-none h-full z-20">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            />

            {/* Sliding Panel */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="relative w-72 bg-zinc-950 border-r border-white/10 flex flex-col justify-between select-none h-full shadow-2xl z-50"
            >
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 p-1.5 rounded-lg bg-zinc-900 border border-white/10 text-zinc-400 hover:text-white transition cursor-pointer z-50"
              >
                <X className="w-4 h-4" />
              </button>
              {renderSidebarContent(onClose)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
