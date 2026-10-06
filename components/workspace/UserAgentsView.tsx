'use client';

import React from 'react';
import { Agent } from '@/lib/types';
import { Bot, Sparkles } from 'lucide-react';

interface UserAgentsViewProps {
  agents: Agent[];
  onOpenChat: (agentId?: string) => void;
}

export const UserAgentsView: React.FC<UserAgentsViewProps> = ({ agents, onOpenChat }) => {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">My Agents</h2>
        <p className="text-sm text-zinc-400 mt-1">Published assistants available in your workspace.</p>
      </div>
      {agents.length === 0 ? (
        <div className="glass-card rounded-2xl border border-white/5 p-10 text-center text-sm text-zinc-400">
          No published agents are available yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <div key={agent.id} className="glass-card rounded-2xl border border-white/5 p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white">{agent.name}</div>
                    <div className="text-[11px] text-zinc-500 font-mono">{agent.model}</div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">{agent.description}</p>
              <button
                type="button"
                onClick={() => onOpenChat(agent.id)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Chat with agent
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
