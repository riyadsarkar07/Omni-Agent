'use client';

import React from 'react';
import { Agent } from '@/lib/types';
import { AIProvider } from '@/lib/providers/types';
import { Brain } from 'lucide-react';
import { ProviderSelector, ModelSelector } from './ProviderSelector';
import { AdvancedSettings } from './AdvancedSettings';

interface AgentParametersProps {
  agents: Agent[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  selectedRole: string;
  onRoleChange: (role: string) => void;
  providers: AIProvider[];
  selectedProviderId: string;
  onProviderChange: (id: string) => void;
  models: string[];
  model: string;
  onModelChange: (model: string) => void;
  showThinking: boolean;
  thinkingLevel: 'HIGH' | 'LOW' | 'MINIMAL' | 'OFF';
  onThinkingLevel: (level: 'HIGH' | 'LOW' | 'MINIMAL' | 'OFF') => void;
  useStreaming: boolean;
  onUseStreaming: (v: boolean) => void;
  temperature: number;
  onTemperature: (v: number) => void;
  systemInstructions: string;
  onSystemInstructions: (v: string) => void;
  agent?: Agent;
  maxOutputTokens: number;
  topP: number;
  topK: number;
  memoryEnabled: boolean;
  toolsEnabled: string[];
  onMaxOutputTokens: (v: number) => void;
  onTopP: (v: number) => void;
  onTopK: (v: number) => void;
  onMemoryEnabled: (v: boolean) => void;
  onToolsEnabled: (v: string[]) => void;
}

export const AgentParameters: React.FC<AgentParametersProps> = (props) => {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white">Agent Parameters</h3>
          <span className="font-mono text-[10px] font-medium text-zinc-500">Live Config</span>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="oa-agent" className="text-[11px] font-semibold text-zinc-400">
            Agent Preset
          </label>
          <select
            id="oa-agent"
            value={props.selectedAgentId}
            onChange={(e) => props.onSelectAgent(e.target.value)}
            className="h-11 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-xs text-zinc-200 focus:border-cyan-500/40 focus:outline-none"
          >
            {props.agents.length === 0 && <option value="">No agents</option>}
            {props.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="oa-persona" className="text-[11px] font-semibold text-zinc-400">
            System Persona
          </label>
          <select
            id="oa-persona"
            value={props.selectedRole}
            onChange={(e) => props.onRoleChange(e.target.value)}
            className="h-11 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-xs text-zinc-200 focus:border-cyan-500/40 focus:outline-none"
          >
            <option value="custom">Custom (Defined by Agent Preset)</option>
            <option value="programmer">Software Architect & Engineer</option>
            <option value="security">Database Security Expert</option>
            <option value="writer">Creative Novelist & Storyteller</option>
            <option value="assistant">General Supportive Assistant</option>
          </select>
        </div>

        <ProviderSelector
          providers={props.providers}
          value={props.selectedProviderId}
          onChange={props.onProviderChange}
        />

        <ModelSelector models={props.models} value={props.model} onChange={props.onModelChange} />

        {props.showThinking && (
          <div className="space-y-2 rounded-lg border border-indigo-500/25 bg-indigo-950/30 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
              <Brain className="h-3.5 w-3.5 text-indigo-400" />
              Thinking Mode
            </div>
            <select
              value={props.thinkingLevel}
              onChange={(e) => props.onThinkingLevel(e.target.value as 'HIGH' | 'LOW' | 'MINIMAL' | 'OFF')}
              className="h-11 w-full rounded-lg border border-indigo-500/20 bg-zinc-950 px-3 text-xs text-zinc-200 focus:outline-none"
              aria-label="Thinking mode"
            >
              <option value="OFF">Off</option>
              <option value="HIGH">High</option>
            </select>
            <p className="text-[10px] leading-tight text-zinc-500">
              High reasoning is available for this Gemini Pro model.
            </p>
          </div>
        )}

        <label className="flex min-h-14 items-center justify-between rounded-lg border border-white/5 bg-zinc-800/40 px-3">
          <span>
            <span className="block text-xs font-semibold text-zinc-200">SSE</span>
            <span className="text-[10px] text-zinc-500">Stream tokens in real time</span>
          </span>
          <input
            type="checkbox"
            checked={props.useStreaming}
            onChange={(e) => props.onUseStreaming(e.target.checked)}
            className="h-4 w-4 accent-cyan-500"
            aria-label="Enable SSE streaming"
          />
        </label>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] font-semibold text-zinc-400">
            <span>Temperature</span>
            <span className="text-zinc-300">{props.temperature.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={props.temperature}
            onChange={(e) => props.onTemperature(parseFloat(e.target.value))}
            className="w-full accent-cyan-500"
            aria-label="Temperature"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="oa-system" className="text-[11px] font-semibold text-zinc-400">
            Active System Instruction
          </label>
          <textarea
            id="oa-system"
            rows={4}
            value={props.systemInstructions}
            onChange={(e) => props.onSystemInstructions(e.target.value)}
            className="w-full resize-none rounded-lg border border-white/10 bg-zinc-950 p-2.5 text-xs text-zinc-300 focus:border-cyan-500/40 focus:outline-none"
            placeholder="Persona system instruction context..."
          />
        </div>

        <AdvancedSettings
          agent={props.agent}
          maxOutputTokens={props.maxOutputTokens}
          topP={props.topP}
          topK={props.topK}
          memoryEnabled={props.memoryEnabled}
          toolsEnabled={props.toolsEnabled}
          onMaxOutputTokens={props.onMaxOutputTokens}
          onTopP={props.onTopP}
          onTopK={props.onTopK}
          onMemoryEnabled={props.onMemoryEnabled}
          onToolsEnabled={props.onToolsEnabled}
        />
      </div>

      <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-[10px] text-zinc-500">
        <span>Engine: Multi-provider router</span>
        <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Operational
        </span>
      </div>
    </div>
  );
};
