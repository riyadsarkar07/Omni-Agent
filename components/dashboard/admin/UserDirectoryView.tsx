'use client';

import React from 'react';
import { Users, ShieldCheck, Trash2, Edit2 } from 'lucide-react';

export const UserDirectoryView: React.FC = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">User Directory</h2>
          <p className="text-zinc-400 text-sm mt-1">Manage platform users and access roles.</p>
        </div>
        <button className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition-all">
          <Users className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/5 bg-white/5 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
              <th className="py-4 px-6">User</th>
              <th className="py-4 px-6">Role</th>
              <th className="py-4 px-6">Last Active</th>
              <th className="py-4 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {[
              { name: 'Admin User', role: 'admin', active: '2 min ago' },
              { name: 'Developer User', role: 'user', active: '1 hr ago' },
            ].map((u, i) => (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                <td className="py-4 px-6 font-bold text-white">{u.name}</td>
                <td className="py-4 px-6">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="py-4 px-6 text-zinc-400">{u.active}</td>
                <td className="py-4 px-6 text-right flex justify-end gap-2 text-zinc-500">
                  <button className="p-1.5 hover:text-white"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button className="p-1.5 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
