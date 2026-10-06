'use client';

import React, { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { apiFetch } from '@/lib/auth/session-client';
import { AuditLog } from '@/lib/types';

export const SystemAuditView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    apiFetch('/api/v1/admin/audit')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Failed to load audit logs');
        if (!ignore) setLogs(data.logs || []);
      })
      .catch((err: unknown) => {
        if (!ignore) setError((err as Error).message);
      });
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto w-full">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Audit & Security</h2>
        <p className="text-zinc-400 text-sm mt-1">Server-side audit records for admin and security events.</p>
      </div>

      {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-300 text-xs p-3">{error}</div>}

      <div className="glass-card rounded-2xl border border-white/5 overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[720px]">
          <thead>
            <tr className="border-b border-white/5 bg-white/5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-4 px-6">Event</th>
              <th className="py-4 px-6">User</th>
              <th className="py-4 px-6">Resource</th>
              <th className="py-4 px-6">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {logs.map((a) => (
              <tr key={a.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-4 px-6 flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-zinc-500" /> {a.action}</td>
                <td className="py-4 px-6 text-zinc-300">{a.user_email}</td>
                <td className="py-4 px-6 text-zinc-400">{a.resource_type}:{a.resource_id}</td>
                <td className="py-4 px-6 text-zinc-400">{new Date(a.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && !error && <div className="p-6 text-xs text-zinc-500">No audit events recorded yet.</div>}
      </div>
    </div>
  );
};
