'use client';

import React, { useEffect, useState } from 'react';
import { AuthSessionRecord, User, UserFile, UserMemory } from '@/lib/types';
import { apiFetch, clearSessionToken } from '@/lib/auth/session-client';
import { LAST_ADMIN_ERROR } from '@/lib/auth/users-sync';
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
  const [analysisNote, setAnalysisNote] = useState('Private files are stored in owner-scoped storage.');
  const [sessions, setSessions] = useState<AuthSessionRecord[]>([]);
  const [shares, setShares] = useState<Array<{
    id: string;
    resourceType: string;
    resourceId: string;
    sharedWithEmail?: string | null;
    permission: string;
    createdAt: string;
  }>>([]);
  const [busy, setBusy] = useState(false);

  const loadExtras = async () => {
    const [memRes, fileRes, sessionRes, shareRes] = await Promise.all([
      apiFetch('/api/v1/memories'),
      apiFetch('/api/v1/files'),
      apiFetch('/api/auth/sessions'),
      apiFetch('/api/v1/shares'),
    ]);
    if (memRes.ok) {
      const data = await memRes.json();
      setMemories(data.memories || []);
    }
    if (fileRes.ok) {
      const data = await fileRes.json();
      setFiles(data.files || []);
      if (data.message) setAnalysisNote(data.message);
    }
    if (sessionRes.ok) {
      const data = await sessionRes.json();
      setSessions(data.sessions || []);
    }
    if (shareRes.ok) {
      const data = await shareRes.json();
      setShares(data.shares || []);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        await loadExtras();
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
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(data.message || 'File stored privately.');
      await loadExtras();
    } else {
      setMessage(data.error || 'Upload failed');
    }
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

  const handleVerifyEmail = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/auth/verify-email', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message || data.error || 'Verification request sent.');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!currentUser?.email) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email }),
      });
      const data = await res.json();
      setMessage(data.message || data.error || 'If that email exists, a reset link was sent.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokeSession = async (id: string) => {
    const res = await apiFetch(`/api/auth/sessions/${id}`, { method: 'DELETE' });
    if (res.ok) setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const handleRevokeOtherSessions = async () => {
    const res = await apiFetch('/api/auth/sessions?keepCurrent=true', { method: 'DELETE' });
    if (res.ok) await loadExtras();
  };

  const handleRevokeShare = async (id: string) => {
    const res = await apiFetch(`/api/v1/shares/${id}`, { method: 'DELETE' });
    if (res.ok) setShares((prev) => prev.filter((s) => s.id !== id));
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Permanently delete your account, files, memories, and sessions?')) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/auth/account', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || data.message || LAST_ADMIN_ERROR);
        return;
      }
      clearSessionToken();
      onLogout?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Settings</h2>
        <p className="text-sm text-zinc-400 mt-1">Your personal workspace profile, memories, files, and account security.</p>
      </div>

      <form onSubmit={handleSave} className="glass-card rounded-2xl border border-white/5 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center font-bold text-white">
            {(currentUser?.full_name || currentUser?.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-semibold text-white">{currentUser?.full_name || 'Account'}</div>
            <div className="text-xs text-zinc-400">{currentUser?.email}</div>
            <div className="text-[10px] text-zinc-500 font-mono">{currentUser?.id}</div>
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
          {currentUser?.email_confirmed ? ' · Email verified' : ' · Email not verified'}
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
        <p className="text-xs text-zinc-500">Memories are private to you and are never injected into another user&apos;s chat, including shared conversations.</p>
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
        <h3 className="text-sm font-bold text-white">Private files</h3>
        <p className="text-xs text-zinc-500">{analysisNote}</p>
        <input type="file" onChange={handleUpload} className="text-xs text-zinc-300" />
        <div className="space-y-2">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-xs text-zinc-300">
              <button type="button" onClick={() => handleDownloadFile(f)} className="flex-1 truncate text-left hover:text-cyan-300 cursor-pointer">
                {f.original_name}
              </button>
              <span className="text-[10px] text-zinc-500">{f.indexed ? `${f.chunk_count || 0} chunks` : 'stored'}</span>
              <span className="text-[10px] text-zinc-500">{Math.max(1, Math.round(f.size_bytes / 1024))} KB</span>
              <button type="button" onClick={() => handleDeleteFile(f.id)} className="text-zinc-500 hover:text-rose-400 cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {files.length === 0 && <div className="text-xs text-zinc-500">No files uploaded.</div>}
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-3">
        <h3 className="text-sm font-bold text-white">Sharing</h3>
        <p className="text-xs text-zinc-500">Read-only shares you created. Recipients cannot rename, delete, or re-share.</p>
        <div className="space-y-2">
          {shares.map((share) => (
            <div key={share.id} className="flex items-center gap-2 text-xs text-zinc-300">
              <div className="flex-1 truncate">
                {share.resourceType} · {share.sharedWithEmail || share.resourceId}
              </div>
              <button type="button" onClick={() => handleRevokeShare(share.id)} className="text-zinc-500 hover:text-rose-400 cursor-pointer">
                Revoke
              </button>
            </div>
          ))}
          {shares.length === 0 && <div className="text-xs text-zinc-500">No active shares.</div>}
        </div>
      </div>

      <div className="glass-card rounded-2xl border border-white/5 p-5 space-y-3">
        <h3 className="text-sm font-bold text-white">Account security</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={handlePasswordReset} className="px-3 py-2 rounded-xl border border-white/10 text-xs text-zinc-200 cursor-pointer disabled:opacity-40">
            Send password reset
          </button>
          <button type="button" disabled={busy} onClick={handleVerifyEmail} className="px-3 py-2 rounded-xl border border-white/10 text-xs text-zinc-200 cursor-pointer disabled:opacity-40">
            Resend email verification
          </button>
        </div>
        <div className="space-y-2">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center gap-2 text-xs text-zinc-300">
              <div className="flex-1">
                {session.current ? 'Current session' : 'Session'} · {new Date(session.created_at).toLocaleString()}
              </div>
              {!session.current && (
                <button type="button" onClick={() => handleRevokeSession(session.id)} className="text-zinc-500 hover:text-rose-400 cursor-pointer">
                  Revoke
                </button>
              )}
            </div>
          ))}
          {sessions.length === 0 && <div className="text-xs text-zinc-500">No sessions listed.</div>}
        </div>
        {sessions.length > 1 && (
          <button type="button" onClick={handleRevokeOtherSessions} className="text-[11px] text-zinc-300 hover:text-white cursor-pointer">
            Sign out other sessions
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs text-rose-300 hover:text-rose-200 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={handleDeleteAccount}
          className="text-xs text-zinc-500 hover:text-rose-300 cursor-pointer disabled:opacity-40"
        >
          Delete account
        </button>
      </div>
    </div>
  );
};
