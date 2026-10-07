'use client';

import React, { useEffect, useState } from 'react';
import { User, UserFile, UserMemory } from '@/lib/types';
import { apiFetch, clearSessionToken } from '@/lib/auth/session-client';
import { LogOut, Shield, Trash2 } from 'lucide-react';

interface UserSettingsViewProps {
  currentUser: User | null;
  onUserUpdated?: (user: User) => void;
  onLogout?: () => void;
}

export const UserSettingsView: React.FC<UserSettingsViewProps> = ({
  currentUser,
  onUserUpdated,
  onLogout,
}) => {
  const prefs = currentUser?.preferences;
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [defaultModel, setDefaultModel] = useState(prefs?.default_model || '');
  const [appearance, setAppearance] = useState(prefs?.appearance || 'system');
  const [memoryEnabled, setMemoryEnabled] = useState(prefs?.memory_enabled !== false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [memoryDraft, setMemoryDraft] = useState('');
  const [analysisNote, setAnalysisNote] = useState('File storage is available. AI file analysis and RAG are not enabled yet.');

  const loadExtras = async () => {
    const [memRes, fileRes] = await Promise.all([apiFetch('/api/v1/memories'), apiFetch('/api/v1/files')]);
    if (memRes.ok) {
      const data = await memRes.json();
      setMemories(data.memories || []);
    }
    if (fileRes.ok) {
      const data = await fileRes.json();
      setFiles(data.files || []);
      if (data.message) setAnalysisNote(data.message);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [memRes, fileRes] = await Promise.all([apiFetch('/api/v1/memories'), apiFetch('/api/v1/files')]);
        if (ignore) return;
        if (memRes.ok) {
          const data = await memRes.json();
          if (!ignore) setMemories(data.memories || []);
        }
        if (fileRes.ok) {
          const data = await fileRes.json();
          if (ignore) return;
          setFiles(data.files || []);
          if (data.message) setAnalysisNote(data.message);
        }
      } catch {
        if (ignore) return;
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          preferences: {
            default_model: defaultModel.trim() || null,
            appearance,
            memory_enabled: memoryEnabled,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      if (data.user) onUserUpdated?.(data.user);
      setMessage('Profile updated');
    } catch (err: unknown) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memoryDraft.trim()) return;
    const res = await apiFetch('/api/v1/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: memoryDraft.trim() }),
    });
    if (res.ok) {
      setMemoryDraft('');
      await loadExtras();
    }
  };

  const handleDeleteMemory = async (id: string) => {
    const res = await apiFetch(`/api/v1/memories/${id}`, { method: 'DELETE' });
    if (res.ok) setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const handleClearMemories = async () => {
    if (!window.confirm('Clear all of your memories? This cannot be undone.')) return;
    const res = await apiFetch('/api/v1/memories', { method: 'DELETE' });
    if (res.ok) setMemories([]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await apiFetch('/api/v1/files', { method: 'POST', body: form });
    if (res.ok) await loadExtras();
    e.target.value = '';
  };

  const handleDownloadFile = async (file: UserFile) => {
    const res = await apiFetch(`/api/v1/files/${file.id}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.original_name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteFile = async (id: string) => {
    const res = await apiFetch(`/api/v1/files/${id}`, { method: 'DELETE' });
    if (res.ok) setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    clearSessionToken();
    onLogout?.();
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Settings</h2>
        <p className="text-sm text-zinc-400 mt-1">Your personal workspace profile, memories, and files.</p>
      </div>

      <form onSubmit={handleSave} className="glass-card rounded-2xl border border-white/5 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center font-bold text-white">
            {(currentUser?.full_name || currentUser?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{currentUser?.full_name || 'Account'}</div>
            <div className="text-xs text-zinc-400">{currentUser?.email}</div>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Display name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Default model</span>
          <input
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="Leave blank to use platform default"
            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Appearance</span>
          <select
            value={appearance}
            onChange={(e) => setAppearance(e.target.value as 'system' | 'dark' | 'light')}
            className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={memoryEnabled} onChange={(e) => setMemoryEnabled(e.target.checked)} />
          Include saved memories in chat
        </label>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Shield className="w-3.5 h-3.5" />
          Role: {currentUser?.role === 'admin' ? 'Admin' : 'User'}
        </div>

        {message && <p className="text-xs text-cyan-300">{message}</p>}

        <button
          type="submit"
          disabled={saving || !fullName.trim()}
          className="px-4 py-2 rounded-xl bg-white text-zinc-950 text-xs font-bold disabled:opacity-40 cursor-pointer"
        >
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </form>

      <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-white">Memories</h3>
          {memories.length > 0 && (
            <button type="button" onClick={handleClearMemories} className="text-[11px] text-rose-300 hover:text-rose-200 cursor-pointer">
              Clear all
            </button>
          )}
        </div>
        <form onSubmit={handleAddMemory} className="flex gap-2">
          <input
            value={memoryDraft}
            onChange={(e) => setMemoryDraft(e.target.value)}
            placeholder="Something the assistant should remember"
            className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
          />
          <button type="submit" className="px-3 py-2 rounded-xl bg-white text-zinc-950 text-xs font-bold cursor-pointer">
            Add
          </button>
        </form>
        <div className="space-y-2">
          {memories.map((m) => (
            <div key={m.id} className="flex items-start gap-2 text-xs text-zinc-300">
              <div className="flex-1">{m.content}</div>
              <button type="button" onClick={() => handleDeleteMemory(m.id)} className="text-zinc-500 hover:text-rose-400 cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {memories.length === 0 && <div className="text-xs text-zinc-500">No memories saved.</div>}
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-3">
        <h3 className="text-sm font-bold text-white">Files</h3>
        <p className="text-xs text-zinc-500">{analysisNote}</p>
        <input type="file" onChange={handleUpload} className="text-xs text-zinc-300" />
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-xs text-zinc-300">
              <button type="button" onClick={() => handleDownloadFile(f)} className="flex-1 truncate text-left hover:text-cyan-300 cursor-pointer">
                {f.original_name}
              </button>
              <span className="text-[10px] text-zinc-500">{Math.max(1, Math.round(f.size_bytes / 1024))} KB</span>
              <button type="button" onClick={() => handleDeleteFile(f.id)} className="text-zinc-500 hover:text-rose-400 cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {files.length === 0 && <div className="text-xs text-zinc-500">No files uploaded.</div>}
        </div>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-2 text-xs text-rose-300 hover:text-rose-200 cursor-pointer"
      >
        <LogOut className="w-3.5 h-3.5" />
        Sign out
      </button>
    </div>
  );
};
