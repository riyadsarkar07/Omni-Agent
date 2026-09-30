'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import Link from 'next/link';
import { ShieldAlert, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-8 text-center shadow-2xl relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto mb-6 border border-cyan-500/20">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight mb-2">404</h1>
        <h2 className="text-lg font-bold text-slate-300 mb-4">Resource Not Found</h2>
        
        <p className="text-sm text-slate-400 mb-8 max-w-xs mx-auto">
          The endpoint, page, or agent configuration you are looking for does not exist or has been relocated.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 py-2.5 px-6 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-cyan-500/20 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
