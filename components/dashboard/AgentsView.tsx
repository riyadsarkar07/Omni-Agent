'use client';

import React, { useState } from 'react';
import { Agent, Project } from '@/lib/types';
import { AIProvider } from '@/lib/providers/types';
import {
  Bot,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Brain,
  Wrench,
  Check,
  X,
  Sliders,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface AgentsViewProps {
  agents: Agent[];
  projects: Project[];
  activeProject: Project | null;
  onRefresh: () => void;
  onTestInPlayground: (agentId: string) => void;
}

export const AgentsView: React.FC<AgentsViewProps> = ({
  agents,
  projects,
  activeProject,
  onRefresh,
  onTestInPlayground,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState<string>('gemini-3.8-flash');
  const [providerId, setProviderId] = useState<string>('gemini');
  const [fallbackProviderId, setFallbackProviderId] = useState<string>('');
  const [fallbackModel, setFallbackModel] = useState<string>('');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [thinkingLevel, setThinkingLevel] = useState<'HIGH' | 'LOW' | 'MINIMAL' | 'OFF'>('OFF');
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [toolsEnabled, setToolsEnabled] = useState<string[]>(['calculator', 'get_current_time']);
  const [projectId, setProjectId] = useState(activeProject?.id || projects[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<AIProvider[]>([]);

  React.useEffect(() => {
    fetch('/api/v1/providers')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.providers) {
          setProviders(data.providers);
        }
      })
      .catch(() => {});
  }, []);

  const availableTools = [
    { id: 'calculator', name: 'Math Calculator', desc: 'Safely evaluate math expressions' },
    { id: 'get_current_time', name: 'World Clock & Time', desc: 'UTC dates and timestamps' },
    { id: 'web_search', name: 'Web Knowledge Lookup', desc: 'Search documentation & references' },
    { id: 'generate_uuid', name: 'UUID Generator', desc: 'Create unique random UUIDs' },
  ];

  const handleOpenCreate = () => {
    setEditingAgent(null);
    setName('');
    setDescription('');
    setModel('gemini-3.8-flash');
    setProviderId('gemini');
    setFallbackProviderId('');
    setFallbackModel('');
    setSystemInstructions('You are an intelligent, helpful, and concise AI assistant.');
    setTemperature(0.7);
    setThinkingLevel('OFF');
    setMemoryEnabled(true);
    setToolsEnabled(['calculator', 'get_current_time']);
    setProjectId(activeProject?.id || projects[0]?.id || '');
    setError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setName(agent.name);
    setDescription(agent.description);
    setModel(agent.model);
    setProviderId(agent.provider_id || 'gemini');
    setFallbackProviderId(agent.fallback_provider_id || '');
    setFallbackModel(agent.fallback_model || '');
    setSystemInstructions(agent.system_instructions);
    setTemperature(agent.temperature);
    setThinkingLevel(agent.thinking_level || 'OFF');
    setMemoryEnabled(agent.memory_enabled);
    setToolsEnabled(agent.tools_enabled || []);
    setProjectId(agent.project_id);
    setError(null);
    setIsModalOpen(true);
  };

  const handleToggleTool = (toolId: string) => {
    setToolsEnabled((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Agent name is required');
      return;
    }
    if (!systemInstructions.trim()) {
      setError('System instructions are required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = {
        name,
        description,
        model,
        provider_id: providerId,
        fallback_provider_id: fallbackProviderId || null,
        fallback_model: fallbackModel || null,
        system_instructions: systemInstructions,
        temperature,
        thinking_level: thinkingLevel,
        memory_enabled: memoryEnabled,
        tools_enabled: toolsEnabled,
        project_id: projectId,
      };

      if (editingAgent) {
        const res = await fetch(`/api/v1/agents/${editingAgent.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-internal-admin': 'true' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || data.error || 'Failed to update agent');
        }
      } else {
        const res = await fetch('/api/v1/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-admin': 'true' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || data.error || 'Failed to create agent');
        }
      }

      setIsModalOpen(false);
      onRefresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (agentId: string) => {
    if (!confirm('Are you sure you want to delete this agent?')) return;
    try {
      await fetch(`/api/v1/agents/${agentId}`, {
        method: 'DELETE',
        headers: { 'x-internal-admin': 'true' },
      });
      onRefresh();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">AI Agent Directory</h2>
          <p className="text-xs text-slate-400">
            Configure system personalities, Gemini reasoning levels, and tool execution bindings.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
        >
          <Plus className="w-4 h-4" />
          Create New Agent
        </button>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const project = projects.find((p) => p.id === agent.project_id);
          const isHighThinking = agent.thinking_level === 'HIGH' || agent.model === 'gemini-3.1-pro-preview';

          return (
            <div
              key={agent.id}
              className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 flex flex-col justify-between hover:border-slate-700/80 transition-all space-y-4 shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600/30 to-indigo-600/30 border border-cyan-500/30 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-white line-clamp-1">{agent.name}</h3>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <Layers className="w-3 h-3 text-slate-500" />
                        <span>{project?.name || 'Project'}</span>
                      </div>
                    </div>
                  </div>

                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Published
                  </span>
                </div>

                <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                  {agent.description || 'Custom multi-turn Gemini agent.'}
                </p>

                {/* Model Badges */}
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {agent.model}
                  </span>
                  {isHighThinking && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                      <Brain className="w-3 h-3" />
                      Thinking: HIGH
                    </span>
                  )}
                  {agent.tools_enabled && agent.tools_enabled.length > 0 && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 flex items-center gap-1">
                      <Wrench className="w-3 h-3" />
                      {agent.tools_enabled.length} Tools
                    </span>
                  )}
                </div>

                {/* System Prompt snippet */}
                <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 p-2.5 text-[11px] text-slate-400 line-clamp-2 font-mono">
                  {agent.system_instructions}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <button
                  onClick={() => onTestInPlayground(agent.id)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Test Live
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(agent)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Edit Agent"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(agent.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Delete Agent"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-cyan-400" />
                {editingAgent ? 'Edit Agent Configuration' : 'Create New AI Agent'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {error && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                  {error}
                </div>
              )}

              {/* Name & Project */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Agent Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Dating Matchmaker, Code Architect"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Associated Project</label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short summary of this agent's scope"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Provider & Model Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Active AI Provider</label>
                  <select
                    value={providerId}
                    onChange={(e) => {
                      const prov = e.target.value;
                      setProviderId(prov);
                      const matched = providers.find((p) => p.id === prov);
                      if (matched) {
                        setModel(matched.defaultModel);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    {providers.length === 0 ? (
                      <option value="gemini">Google Gemini</option>
                    ) : (
                      providers.filter((p) => p.enabled).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Active Model</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    {providers.length === 0 ? (
                      <>
                        <option value="gemini-3.8-flash">Gemini 3.8 Flash (General Workhorse)</option>
                        <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Complex Reasoning)</option>
                        <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Ultra-Low Latency)</option>
                      </>
                    ) : (
                      (providers.find((p) => p.id === providerId)?.models || []).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Fallback Provider & Fallback Model (Optional) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Fallback Provider (Optional)</label>
                  <select
                    value={fallbackProviderId}
                    onChange={(e) => {
                      const prov = e.target.value;
                      setFallbackProviderId(prov);
                      if (prov) {
                        const matched = providers.find((p) => p.id === prov);
                        if (matched) setFallbackModel(matched.defaultModel);
                      } else {
                        setFallbackModel('');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="">No Fallback</option>
                    {providers.filter((p) => p.enabled && p.id !== providerId).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Fallback Model</label>
                  <select
                    disabled={!fallbackProviderId}
                    value={fallbackModel}
                    onChange={(e) => setFallbackModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 cursor-pointer disabled:opacity-40"
                  >
                    <option value="">No Fallback Model</option>
                    {(providers.find((p) => p.id === fallbackProviderId)?.models || []).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Thinking Mode</label>
                  <select
                    value={thinkingLevel}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setThinkingLevel(val);
                      if (val === 'HIGH') {
                        setModel('gemini-3.1-pro-preview');
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="OFF">Standard (Off)</option>
                    <option value="HIGH">ThinkingLevel.HIGH (Reasoning)</option>
                    <option value="LOW">ThinkingLevel.LOW</option>
                  </select>
                </div>

              {/* System Instructions */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  System Instructions & Persona *
                </label>
                <textarea
                  rows={4}
                  value={systemInstructions}
                  onChange={(e) => setSystemInstructions(e.target.value)}
                  placeholder="You are an expert customer concierge. Greet users with warmth and resolve questions..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none font-mono"
                  required
                />
              </div>

              {/* Temperature & Memory */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-300">
                    <span>Creativity (Temperature)</span>
                    <span className="text-cyan-400">{temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id="memToggle"
                    checked={memoryEnabled}
                    onChange={(e) => setMemoryEnabled(e.target.checked)}
                    className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
                  />
                  <label htmlFor="memToggle" className="text-xs font-semibold text-slate-300 cursor-pointer">
                    Enable Conversation Memory
                  </label>
                </div>
              </div>

              {/* Tools Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Enable Agent Function Tools</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableTools.map((t) => {
                    const isChecked = toolsEnabled.includes(t.id);
                    return (
                      <div
                        key={t.id}
                        onClick={() => handleToggleTool(t.id)}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>{t.name}</span>
                          {isChecked && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{t.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-cyan-500/20"
                >
                  {isSubmitting ? 'Saving...' : editingAgent ? 'Save Changes' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
