'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { apiFetch } from '@/lib/auth/session-client';
import { User } from '@/lib/types';
import { LAST_ADMIN_ERROR } from '@/lib/auth/users-sync';

export const UserDirectoryView: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeAdminCount = useMemo(
    () => users.filter((u) => u.role === 'admin' && u.status !== 'disabled').length,
    [users]
  );

  const loadUsers = async (q?: string) => {
    const res = await apiFetch(`/api/v1/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error || 'Failed to load users');
    setUsers(data.users || []);
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        await loadUsers();
      } catch (err: unknown) {
        if (!ignore) setError((err as Error).message);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, []);

  const updateUser = async (id: string, payload: { role?: User['role']; status?: 'active' | 'disabled' }) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || LAST_ADMIN_ERROR);
      setUsers((prev) => prev.map((u) => (u.id === id ? data.user : u)));
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Never';
    return date.toLocaleString();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">Users</h2>
          <p className="text-zinc-400 text-sm mt-1">
            All authenticated platform users from Auth. {users.length} unique user{users.length === 1 ? '' : 's'}.
          </p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') loadUsers(query).catch((err: unknown) => setError((err as Error).message));
          }}
          placeholder="Search email, name, or id..."
          className="w-full bg-zinc-900 border border-white/5 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none"
        />
      </div>

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs p-3">{error}</div>}

      <div className="glass-card rounded-2xl border border-white/5 overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[960px]">
          <thead>
            <tr className="border-b border-white/5 bg-white/5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-4 px-6">Name</th>
              <th className="py-4 px-6">Email</th>
              <th className="py-4 px-6">User ID</th>
              <th className="py-4 px-6">Role</th>
              <th className="py-4 px-6">Status</th>
              <th className="py-4 px-6">Created</th>
              <th className="py-4 px-6">Last active</th>
              <th className="py-4 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {users.map((u) => {
              const isLastAdmin = u.role === 'admin' && u.status !== 'disabled' && activeAdminCount <= 1;
              return (
                <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-6 font-bold text-white">{u.full_name || u.email}</td>
                  <td className="py-4 px-6 text-zinc-300">{u.email}</td>
                  <td className="py-4 px-6 font-mono text-[10px] text-zinc-500">{u.id}</td>
                  <td className="py-4 px-6">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>
                      {u.role === 'admin' ? 'admin' : 'user'}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${u.status === 'disabled' ? 'text-rose-300' : 'text-emerald-300'}`}>
                      {u.status || 'active'}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-zinc-400">{formatDate(u.created_at)}</td>
                  <td className="py-4 px-6 text-zinc-400">{formatDate(u.last_active_at)}</td>
                  <td className="py-4 px-6 text-right space-x-2">
                    <button
                      type="button"
                      disabled={busyId === u.id || (u.role === 'admin' && isLastAdmin)}
                      title={u.role === 'admin' && isLastAdmin ? LAST_ADMIN_ERROR : undefined}
                      onClick={() => updateUser(u.id, { role: u.role === 'admin' ? 'developer' : 'admin' })}
                      className="text-[11px] text-purple-300 hover:text-purple-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {u.role === 'admin' ? 'Make user' : 'Make admin'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === u.id || (u.status !== 'disabled' && isLastAdmin)}
                      title={u.status !== 'disabled' && isLastAdmin ? LAST_ADMIN_ERROR : undefined}
                      onClick={() => updateUser(u.id, { status: u.status === 'disabled' ? 'active' : 'disabled' })}
                      className="text-[11px] text-zinc-300 hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {u.status === 'disabled' ? 'Activate' : 'Disable'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && <div className="p-6 text-xs text-zinc-500">No users found.</div>}
      </div>
    </div>
  );
};
