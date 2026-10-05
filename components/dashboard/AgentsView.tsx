'use client';

import React, { useState, useEffect } from 'react';
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
  X,
  Layers,
  ChevronRight,
  ShieldAlert,
  Check,
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

  useEffect(() => {
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
    if (!name.trim() || !systemInstructions.trim()) {
      setError('Agent name and system instructions are required');
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

      const endpoint = editingAgent ? `/api/v1/agents/${editingAgent.id}` : '/api/v1/agents';
      const method = editingAgent ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-internal-admin': 'true' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || data.error || 'Failed to update agent');
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
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto w-full">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">AI Agent Directory</h2>
          <p className="text-zinc-400 text-sm mt-1">
            Configure system personalities, Gemini reasoning levels, and tool execution bindings.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-100 text-zinc-950 font-bold text-xs flex items-center gap-2 transition-all shadow-lg"
        >
          <Plus className="w-4 h-4" /> Create New Agent
        </button>
      </div>

      {/* Agents Grid */}
      {agents.length === 0 ? (
        <div className="glass-panel border-dashed border-2 border-white/10 rounded-3xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
            <Bot className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Agents Found</h3>
          <p className="text-sm text-zinc-400 mb-6 max-w-sm">
            Create your first agent to configure persona behaviors and connect them to AI providers.
          </p>
          <button
            onClick={handleOpenCreate}
            className="px-5 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-bold text-xs flex items-center gap-2 transition-all border border-cyan-500/20"
          >
            <Plus className="w-4 h-4" /> Create Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => {
            const project = projects.find((p) => p.id === agent.project_id);
            const isHighThinking = agent.thinking_level === 'HIGH' || agent.model === 'gemini-3.1-pro-preview';

            return (
              <div
                key={agent.id}
                className="glass-card rounded-2xl p-6 flex flex-col justify-between hover:border-white/10 transition-all space-y-5"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-400/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center shadow-inner">
                        <Bot className="w-6 h-6 text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-[15px] text-white line-clamp-1">{agent.name}</h3>
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-1 font-medium">
                          <Layers className="w-3 h-3 text-zinc-500" />
                          <span>{project?.name || 'Project'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                    {agent.description || 'Custom multi-turn Gemini agent.'}
                  </p>

                  {/* Model Badges */}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-white/5 border border-white/10 uppercase tracking-widest text-zinc-300">
                      {agent.model}
                    </span>
                    {isHighThinking && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1 uppercase tracking-widest">
                        <Brain className="w-3 h-3" /> HIGH THINKING
                      </span>
                    )}
                    {agent.tools_enabled && agent.tools_enabled.length > 0 && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1 uppercase tracking-widest">
                        <Wrench className="w-3 h-3" /> {agent.tools_enabled.length} TOOLS
                      </span>
                    )}
                  </div>

                  {/* System Prompt snippet */}
                  <div className="rounded-xl bg-zinc-950/50 border border-white/5 p-3 text-[11px] text-zinc-500 line-clamp-2 font-mono">
                    {agent.system_instructions}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                  <button
                    onClick={() => onTestInPlayground(agent.id)}
                    className="px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-cyan-500/0 hover:border-cyan-500/30"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Test Live
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEdit(agent)}
                      className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title="Edit Agent"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(agent.id)}
                      className="p-2 rounded-xl text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Delete Agent"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-8 py-5 border-b border-white/5 flex items-center justify-between bg-zinc-900/50">
              <h3 className="font-extrabold text-lg text-white flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
                  <Bot className="w-5 h-5" />
                </div>
                {editingAgent ? 'Edit Agent Identity' : 'Create New AI Agent'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 hover:text-white p-1 cursor-pointer transition">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-8 space-y-6 max-h-[75vh] overflow-y-auto">
              {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3 font-medium">
                  <ShieldAlert className="w-5 h-5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Agent Name *</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Code Architect" className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Associated Project</label>
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors">
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Description</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short summary" className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors" />
              </div>

              <div className="p-5 rounded-2xl border border-white/5 bg-zinc-900/30 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">AI Provider</label>
                    <select value={providerId} onChange={(e) => {
                        const prov = e.target.value;
                        setProviderId(prov);
                        const matched = providers.find((p) => p.id === prov);
                        if (matched) setModel(matched.defaultModel || matched.models?.[0]);
                      }} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors cursor-pointer">
                      {providers.length === 0 ? <option value="gemini">Google Gemini</option> : providers.filter(p=>p.enabled).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Primary Model</label>
                    {providers.find((p) => p.id === providerId)?.models?.length ? (
                      <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors cursor-pointer">
                        {providers.find((p) => p.id === providerId)?.models?.map((m: string) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Enter model ID" className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono" />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Fallback Provider</label>
                    <select value={fallbackProviderId} onChange={(e) => {
                      setFallbackProviderId(e.target.value);
                      const matched = providers.find((p) => p.id === e.target.value);
                      if (matched) setFallbackModel(matched.defaultModel || matched.models?.[0] || '');
                    }} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white cursor-pointer">
                      <option value="">None</option>
                      {providers.filter((p) => p.enabled && p.id !== providerId).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Fallback Model</label>
                    {providers.find((p) => p.id === fallbackProviderId)?.models?.length ? (
                      <select value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white cursor-pointer">
                        {providers.find((p) => p.id === fallbackProviderId)?.models?.map((m: string) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <input value={fallbackModel} onChange={(e) => setFallbackModel(e.target.value)} placeholder="Optional fallback model" className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono" />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center justify-between">
                  <span>System Prompt & Instructions *</span>
                </label>
                <textarea value={systemInstructions} onChange={(e) => setSystemInstructions(e.target.value)} placeholder="You are a helpful assistant..." rows={4} className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors resize-none font-mono" required />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                 <div className="space-y-3">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex justify-between">
                      Temperature <span>{temperature}</span>
                    </label>
                    <input type="range" min="0" max="2" step="0.1" value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full accent-cyan-500" />
                 </div>
                 <div className="space-y-3">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Gemini Thinking Mode</label>
                    <div className="flex items-center gap-4 bg-zinc-900 p-1 rounded-xl">
                      {(['OFF', 'LOW', 'HIGH'] as const).map(lvl => (
                        <button key={lvl} type="button" onClick={() => setThinkingLevel(lvl)} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${thinkingLevel === lvl ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>{lvl}</button>
                      ))}
                    </div>
                 </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-white/5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2"><Wrench className="w-3.5 h-3.5" /> Tool Bindings</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableTools.map(tool => {
                    const active = toolsEnabled.includes(tool.id);
                    return (
                      <div key={tool.id} onClick={() => handleToggleTool(tool.id)} className={`p-4 rounded-xl border transition cursor-pointer flex items-center gap-3 ${active ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-zinc-900 border-white/5 hover:border-white/10'}`}>
                        <div className={`w-5 h-5 rounded-md flex items-center justify-center border ${active ? 'bg-cyan-500 text-zinc-950 border-cyan-400' : 'bg-transparent border-zinc-600'}`}>
                          {active && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <div className={`text-sm font-bold ${active ? 'text-white' : 'text-zinc-300'}`}>{tool.name}</div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">{tool.desc}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="pt-6 border-t border-white/5 flex gap-3 justify-end items-center">
                <button type="button" disabled={isSubmitting} onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl bg-transparent hover:bg-white/5 text-white text-sm font-bold transition">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-zinc-950 text-sm font-bold shadow-lg transition flex items-center gap-2">
                  {isSubmitting ? 'Saving...' : 'Save Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
