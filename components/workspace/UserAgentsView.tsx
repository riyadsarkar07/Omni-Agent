'use client';

import React, { useMemo, useState } from 'react';
import { Agent } from '@/lib/types';
import { apiFetch } from '@/lib/auth/session-client';
import { Bot, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';

interface UserAgentsViewProps {
  agents: Agent[];
  onOpenChat: (agentId?: string) => void;
  onChanged?: () => void;
}

const emptyForm = {
  name: '',
  description: '',
  model: 'gemini-3.8-flash',
  system_instructions: 'You are a helpful personal assistant.',
};

export const UserAgentsView: React.FC<UserAgentsViewProps> = ({ agents, onOpenChat, onChanged }) => {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myAgents = useMemo(() => agents.filter((a) => a.scope === 'user'), [agents]);
  const published = useMemo(() => agents.filter((a) => a.scope !== 'user' && a.is_published), [agents]);

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setCreating(true);
    setError(null);
  };

  const startEdit = (agent: Agent) => {
    setCreating(true);
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      description: agent.description || '',
      model: agent.model,
      system_instructions: agent.system_instructions,
    });
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        model: form.model,
        system_instructions: form.system_instructions.trim(),
      };
      const res = editingId
        ? await apiFetch(`/api/v1/agents/${editingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await apiFetch('/api/v1/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to save agent');
      setCreating(false);
      setEditingId(null);
      onChanged?.();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agent: Agent) => {
    if (!window.confirm(`Delete ${agent.name}?`)) return;
    const res = await apiFetch(`/api/v1/agents/${agent.id}`, { method: 'DELETE' });
    if (res.ok) onChanged?.();
  };

  const renderCard = (agent: Agent, mine: boolean) => (
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
        {mine && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => startEdit(agent)} className="p-1.5 text-zinc-500 hover:text-white cursor-pointer">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button type="button" onClick={() => handleDelete(agent)} className="p-1.5 text-zinc-500 hover:text-rose-400 cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">My Agents</h2>
          <p className="text-sm text-zinc-400 mt-1">Your private agents plus published platform assistants.</p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-1.5 rounded-xl bg-white text-zinc-950 text-xs font-bold px-3 py-2 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New agent
        </button>
      </div>

      {creating && (
        <form onSubmit={handleSave} className="glass-card rounded-2xl border border-white/5 p-5 space-y-3">
          <div className="text-sm font-semibold text-white">{editingId ? 'Edit agent' : 'Create agent'}</div>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Name"
            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
          />
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Description"
            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
          />
          <input
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
            placeholder="Model"
            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
          />
          <textarea
            value={form.system_instructions}
            onChange={(e) => setForm((f) => ({ ...f, system_instructions: e.target.value }))}
            rows={4}
            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
          />
          {error && <p className="text-xs text-rose-300">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving || form.name.trim().length < 2} className="px-4 py-2 rounded-xl bg-white text-zinc-950 text-xs font-bold disabled:opacity-40 cursor-pointer">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="px-4 py-2 rounded-xl border border-white/10 text-xs text-zinc-300 cursor-pointer">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-3">Private</div>
        {myAgents.length === 0 ? (
          <div className="glass-card rounded-2xl border border-white/5 p-8 text-sm text-zinc-400">No private agents yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{myAgents.map((a) => renderCard(a, true))}</div>
        )}
      </div>

      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-3">Published</div>
        {published.length === 0 ? (
          <div className="glass-card rounded-2xl border border-white/5 p-8 text-sm text-zinc-400">No published agents are available yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{published.map((a) => renderCard(a, false))}</div>
        )}
      </div>
    </div>
  );
};
