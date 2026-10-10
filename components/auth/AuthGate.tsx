'use client';

import React, { useEffect, useState } from 'react';
import { User } from '@/lib/types';
import { apiFetch, clearSessionToken } from '@/lib/auth/session-client';
import { AuthView } from '@/components/auth/AuthView';

interface AuthGateProps {
  children: (user: User, setUser: (user: User | null) => void) => React.ReactNode;
  requireAdmin?: boolean;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children, requireAdmin = false }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const appearance = user?.preferences?.appearance || 'system';
    const root = document.documentElement;
    if (appearance === 'light' || appearance === 'dark') {
      root.dataset.theme = appearance;
    } else {
      delete root.dataset.theme;
    }
  }, [user?.preferences?.appearance]);

  useEffect(() => {
    let ignore = false;
    apiFetch('/api/auth/me')
      .then(async (res) => {
        const data = await res.json();
        if (ignore) return;
        if (data.authenticated && data.user) {
          if (requireAdmin && data.user.role !== 'admin') {
            setDenied(true);
            setUser(data.user);
          } else {
            setUser(data.user);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [requireAdmin]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-main)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
          <span className="text-xs text-slate-500 font-semibold tracking-wider">Initialising Intelligence...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthView
        onLoginSuccess={(u) => {
          if (requireAdmin && u.role !== 'admin') {
            setDenied(true);
            setUser(u);
            return;
          }
          setDenied(false);
          setUser(u);
        }}
      />
    );
  }

  if (denied) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-main)] p-6">
        <div className="max-w-md glass-card rounded-2xl border border-white/5 p-8 text-center space-y-4">
          <h1 className="text-xl font-extrabold text-white">Admin access required</h1>
          <p className="text-sm text-zinc-400">Your account does not have permission to open the Admin Console.</p>
          <div className="flex justify-center gap-3">
            <a href="/workspace" className="px-4 py-2 rounded-xl bg-white text-zinc-950 text-xs font-bold">
              Go to Workspace
            </a>
            <button
              type="button"
              onClick={async () => {
                await apiFetch('/api/auth/logout', { method: 'POST' });
                clearSessionToken();
                setUser(null);
                setDenied(false);
              }}
              className="px-4 py-2 rounded-xl border border-white/10 text-xs text-zinc-300 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children(user, setUser)}</>;
};
