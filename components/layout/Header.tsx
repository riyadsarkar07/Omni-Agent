'use client';

import React from 'react';
import { Project } from '@/lib/types';
import { Layers, Bot, Sparkles, ShieldCheck, Database, Terminal, Menu } from 'lucide-react';

interface HeaderProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (project: Project) => void;
  onOpenPlayground: () => void;
  isSupabaseConnected: boolean;
  currentUser: import('@/lib/types').User | null;
  onOpenAuthModal: () => void;
  onMenuToggle?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  projects,
  activeProject,
  onSelectProject,
  onOpenPlayground,
  isSupabaseConnected,
  currentUser,
  onOpenAuthModal,
  onMenuToggle,
}) => {
  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-2 md:gap-4">
        {/* Mobile Hamburger Menu Toggle */}
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="lg:hidden p-2 -ml-1 rounded-lg bg-slate-800/80 border border-slate-700/70 text-slate-300 hover:text-white transition cursor-pointer"
            aria-label="Toggle Navigation Sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        {/* Project Selector */}
        <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/70 rounded-lg px-3 py-1.5">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-medium text-slate-400">Project:</span>
          <select
            className="bg-transparent text-sm font-semibold text-slate-100 focus:outline-none cursor-pointer pr-1"
            value={activeProject?.id || ''}
            onChange={(e) => {
              const p = projects.find((proj) => proj.id === e.target.value);
              if (p) onSelectProject(p);
            }}
          >
            {projects.map((proj) => (
              <option key={proj.id} value={proj.id} className="bg-slate-900 text-slate-100">
                {proj.name} ({proj.slug})
              </option>
            ))}
          </select>
        </div>

        {/* Live Status Badges */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Gemini Engine Active
          </div>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isSupabaseConnected
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
            }`}
          >
            <Database className="w-3 h-3" />
            {isSupabaseConnected ? 'Supabase Postgres' : 'Resilient DB Active'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Quick Launch Playground */}
        <button
          onClick={onOpenPlayground}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Test in Playground
        </button>

        {/* Auth / Admin Indicator */}
        <button
          onClick={onOpenAuthModal}
          className="flex items-center gap-2 pl-3 border-l border-slate-800 text-slate-300 text-xs hover:text-white cursor-pointer transition"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-inner uppercase">
            {currentUser?.full_name ? currentUser.full_name.charAt(0) : 'A'}
          </div>
          <div className="hidden lg:block text-left">
            <div className="font-medium text-slate-200 text-xs leading-none">
              {currentUser ? currentUser.full_name || currentUser.email : 'Platform Owner'}
            </div>
            <div className="text-[10px] text-slate-500 leading-none mt-1">
              Role: {currentUser?.role || 'admin'}
            </div>
          </div>
        </button>
      </div>
    </header>
  );
};
