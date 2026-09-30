'use client';

import React from 'react';
import { Lock, FileText, AlertCircle } from 'lucide-react';

export const SystemAuditView: React.FC = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto w-full">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">Audit & Security</h2>
        <p className="text-zinc-400 text-sm mt-1">Review system logs and security events.</p>
      </div>

      <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/5 bg-white/5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-4 px-6">Event</th>
              <th className="py-4 px-6">User</th>
              <th className="py-4 px-6">Timestamp</th>
              <th className="py-4 px-6 text-right">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {[
              { event: 'User Login', user: 'admin@omniagent.io', time: '10:04 AM', severity: 'info' },
              { event: 'API Key Revoked', user: 'dev@company.com', time: '09:12 AM', severity: 'warning' },
              { event: 'Unauthorized Access Attempt', user: 'unknown', time: '08:45 AM', severity: 'critical' },
            ].map((a, i) => (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-4 px-6 flex items-center gap-2"><FileText className="w-3.5 h-3.5 text-zinc-500"/> {a.event}</td>
                <td className="py-4 px-6 text-zinc-300">{a.user}</td>
                <td className="py-4 px-6 text-zinc-400">{a.time}</td>
                <td className="py-4 px-6 text-right">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                    a.severity === 'critical' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                    a.severity === 'warning' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                    'bg-zinc-500/10 text-zinc-300 border border-zinc-500/20'
                  }`}>
                    {a.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
