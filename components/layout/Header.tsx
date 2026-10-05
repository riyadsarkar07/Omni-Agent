'use client';

import React from 'react';
import { Project, User } from '@/lib/types';
import { Layers, Sparkles, Database, Menu, ChevronDown, Bell, Search, UserCircle } from 'lucide-react';

interface HeaderProps {
  projects: Project[];
  activeProject: Project | null;
  onSelectProject: (project: Project) => void;
  onOpenPlayground: () => void;
  isSupabaseConnected: boolean;
  currentUser: User | null;
  onOpenAuthModal: () => void;
  onMenuToggle?: () => void;
  isAdminMode?: boolean;
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
  isAdminMode,
}) => {
  return (
    <header className="h-16 border-b border-white/5 bg-zinc-950/50 backdrop-blur-xl px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger */}
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="lg:hidden p-2 -ml-1 rounded-lg bg-white/5 border border-white/10 text-zinc-400 hover:text-white transition cursor-pointer hover:bg-white/10"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        {/* Project Selector - Sleek version */}
        <div className="flex items-center gap-2 bg-zinc-900 border border-white/5 rounded-xl px-3 py-1.5 shadow-sm">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <select
            className="bg-transparent text-[13px] font-semibold text-white focus:outline-none cursor-pointer pr-1"
            value={activeProject?.id || ''}
            onChange={(e) => {
              const p = projects.find((proj) => proj.id === e.target.value);
              if (p) onSelectProject(p);
            }}
          >
            {projects.map((proj) => (
              <option key={proj.id} value={proj.id} className="bg-zinc-900 text-white">
                {proj.name}
              </option>
            ))}
          </select>
        </div>

        {/* Badges - Subtle */}
        <div className="hidden md:flex items-center gap-2">
          <div className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Multi-Provider
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Quick Launch Playground */}
        {!isAdminMode && (
          <button
            onClick={onOpenPlayground}
            className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 text-xs font-bold transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Launch Playground
          </button>
        )}

        {/* User / Admin Indicator */}
        <button
          onClick={onOpenAuthModal}
          className="flex items-center gap-2 pl-3 border-l border-white/10 text-zinc-300 text-xs hover:text-white cursor-pointer transition"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center font-bold text-white text-xs shadow-inner uppercase">
            {currentUser?.full_name ? currentUser.full_name.charAt(0) : 'A'}
          </div>
          <div className="hidden md:block text-left">
            <div className="font-semibold text-zinc-100 text-[11px] leading-none">
              {currentUser?.full_name || 'Account'}
            </div>
          </div>
        </button>
      </div>
    </header>
  );
};
