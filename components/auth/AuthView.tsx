'use client';

import React, { useState } from 'react';
import { User } from '@/lib/types';
import { saveSessionToken } from '@/lib/auth/session-client';
import { Lock, Mail, User as UserIcon, Shield, ArrowRight, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AuthViewProps {
  onLoginSuccess: (user: User) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = isRegister
        ? { email, password, fullName }
        : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      saveSessionToken(data.session?.token);
      onLoginSuccess(data.user);
    } catch (err: unknown) {
      setError((err as Error).message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-[var(--bg-main)] antialiased overflow-hidden">
      {/* Visual / Brand Panel (Hidden on small mobile, visible on tablet+) */}
      <div className="hidden md:flex flex-1 relative flex-col justify-between p-12 lg:p-20 overflow-hidden bg-gradient-to-br from-zinc-950 via-[var(--bg-main)] to-cyan-950/20">
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay pointer-events-none" />

        {/* Glowing Orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600 p-0.5 shadow-lg shadow-cyan-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center">
              <Zap className="w-6 h-6 text-cyan-400" />
            </div>
          </div>
          <span className="text-2xl font-extrabold text-white tracking-tight">OmniAgent</span>
        </div>

        <div className="relative z-10 max-w-lg mt-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <h1 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6 tracking-tight">
              Universal AI Agent <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                Infrastructure.
              </span>
            </h1>
            <p className="text-zinc-400 text-lg leading-relaxed mb-8">
              Deploy, monitor, and scale production-grade AI agents across your organization from a single, resilient platform.
            </p>

            <div className="flex flex-wrap gap-4 text-sm font-medium text-zinc-300">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
                <Shield className="w-4 h-4 text-emerald-400" /> Enterprise Auth
              </div>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
                <Activity className="w-4 h-4 text-cyan-400" /> Live Telemetry
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Auth Form Panel */}
      <div className="flex-1 lg:flex-none lg:w-[540px] flex items-center justify-center p-6 sm:p-12 z-20 bg-[var(--bg-panel)] shadow-2xl border-l border-white/5 relative">
        <div className="w-full max-w-sm">
          {/* Mobile Header (Only visible when side panel is hidden) */}
          <div className="md:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-blue-600 p-[1px] flex items-center justify-center">
              <div className="w-full h-full bg-zinc-950 rounded-[11px] flex items-center justify-center">
                <Zap className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <span className="text-xl font-extrabold text-white tracking-tight">OmniAgent</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-extrabold text-white tracking-tight mb-2">
              {isRegister ? 'Create an account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-zinc-400">
              {isRegister
                ? 'Enter your details below to create your workspace.'
                : 'Sign in to your platform account to continue.'}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {(error || info) && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className={`mb-6 p-4 rounded-xl text-sm flex items-start gap-3 ${
                  error
                    ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                    : 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-300'
                }`}
              >
                <div className={`p-1 rounded-full shrink-0 ${error ? 'bg-rose-500/20' : 'bg-cyan-500/20'}`}>
                  <div className={`w-2 h-2 rounded-full ${error ? 'bg-rose-500' : 'bg-cyan-400'}`} />
                </div>
                <span>{error || info}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence>
              {isRegister && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1.5"
                >
                  <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wide">Full Name</label>
                  <div className="relative group">
                    <UserIcon className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-500 group-focus-within:text-cyan-400 transition-colors" />
                    <input
                      type="text"
                      required={isRegister}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:bg-zinc-900 transition-all shadow-sm"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wide">Email Address</label>
              <div className="relative group">
                <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-500 group-focus-within:text-cyan-400 transition-colors" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@omniagent.io"
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:bg-zinc-900 transition-all shadow-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wide">Password</label>
                {!isRegister && (
                  <button
                    type="button"
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                    onClick={async () => {
                      setError(null);
                      setInfo(null);
                      if (!email.trim()) {
                        setError('Enter your email first');
                        return;
                      }
                      const res = await fetch('/api/auth/forgot-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: email.trim() }),
                      });
                      const data = await res.json().catch(() => ({}));
                      setInfo(data.message || 'If that email exists, a password reset link has been sent.');
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative group">
                <Lock className="w-4 h-4 absolute left-3.5 top-3.5 text-zinc-500 group-focus-within:text-cyan-400 transition-colors" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:bg-zinc-900 transition-all shadow-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full relative group mt-8 py-3 px-4 bg-white hover:bg-zinc-100 text-zinc-950 font-bold rounded-xl shadow-lg transition-all cursor-pointer overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-cyan-400/20 to-blue-500/20 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative flex items-center justify-center gap-2">
                {loading ? 'Authenticating...' : (isRegister ? 'Create Account' : 'Sign In')}
                {!loading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
              </span>
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-white/5 text-center">
            <p className="text-sm text-zinc-400">
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <button
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError(null);
                }}
                className="text-white font-semibold hover:text-cyan-400 transition-colors cursor-pointer"
              >
                {isRegister ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
