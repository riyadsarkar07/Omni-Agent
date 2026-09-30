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
} from 'lucide-react';

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
  | 'providers';

interface SidebarProps {
  currentTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
  agentCount: number;
  projectCount: number;
  apiKeyCount: number;
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
  isOpen = false,
  onClose,
}) => {
  const navItems: NavItem[] = [
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

  const renderSidebarContent = (closeMenu?: () => void) => (
    <div className="flex flex-col justify-between h-full w-full">
      <div>
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-500 p-0.5 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                OmniAgent
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  PRO
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">Universal AI Platform</div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Platform Navigation
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id as DashboardTab);
                  if (closeMenu) closeMenu();
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                } ${item.isSpecial && !isActive ? 'text-indigo-300 hover:text-indigo-200' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? 'text-cyan-400'
                        : item.isSpecial
                        ? 'text-indigo-400'
                        : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      isActive ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800 text-slate-400'
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
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/20">
        <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3 space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
            <span>Powered by Gemini</span>
            <span className="text-[10px] text-emerald-400">v2.4 SDK</span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            Multi-turn conversation retention, tool registry, and high-thinking reasoning engine.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Permanent) */}
      <aside className="hidden lg:flex w-64 border-r border-slate-800/80 bg-slate-950/70 flex-col justify-between shrink-0 select-none h-full">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />

            {/* Sliding Panel */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="relative w-64 bg-slate-950 border-r border-slate-800/80 flex flex-col justify-between select-none h-full shadow-2xl z-50"
            >
              {/* Close Button Inside Drawer */}
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer z-50"
              >
                ✕
              </button>
              {renderSidebarContent(onClose)}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
