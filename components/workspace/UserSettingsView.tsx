'use client';

import React, { useState } from 'react';
import { User } from '@/lib/types';
import { apiFetch, clearSessionToken } from '@/lib/auth/session-client';
import { LogOut, Shield } from 'lucide-react';

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
  const [fullName, setFullName] = useState(currentUser?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim() }),
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

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    clearSessionToken();
    onLogout?.();
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 p-4 md:p-6">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Settings</h2>
        <p className="text-sm text-zinc-400 mt-1">Your personal workspace profile.</p>
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
