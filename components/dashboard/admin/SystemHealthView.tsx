'use client';

import React from 'react';
import { Zap, Activity } from 'lucide-react';

export const SystemHealthView: React.FC = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 max-w-[1600px] mx-auto w-full">
      <div>
        <h2 className="text-2xl font-extrabold text-white tracking-tight">System Health</h2>
        <p className="text-zinc-400 text-sm mt-1">Monitor real-time component performance and service status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card rounded-2xl p-6 border border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-500/10 p-2 rounded-xl text-emerald-400 border border-emerald-500/20"><Activity className="w-5 h-5" /></div>
            <h3 className="font-bold text-lg text-white">Service Status</h3>
          </div>
          <div className="space-y-4">
             {['Database', 'Auth Service', 'Storage', 'Vector DB'].map(service => (
               <div key={service} className="flex justify-between items-center text-sm">
                 <span className="text-zinc-300 font-medium">{service}</span>
                 <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-md text-[10px] uppercase">Online</span>
               </div>
             ))}
          </div>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-white/5">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-amber-500/10 p-2 rounded-xl text-amber-400 border border-amber-500/20"><Zap className="w-5 h-5" /></div>
            <h3 className="font-bold text-lg text-white">System Load</h3>
          </div>
          <div className="h-40 flex items-center justify-center text-zinc-500 text-sm italic">
            Metrics visualization placeholder
          </div>
        </div>
      </div>
    </div>
  );
};
