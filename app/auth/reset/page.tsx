'use client';

import React, { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

function readRecoveryAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const queryParams = new URLSearchParams(window.location.search);
  const type = hashParams.get('type') || queryParams.get('type');
  const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
  if (accessToken && (!type || type === 'recovery')) {
    return accessToken;
  }
  return null;
}

function subscribeHash(onStoreChange: () => void): () => void {
  window.addEventListener('hashchange', onStoreChange);
  return () => window.removeEventListener('hashchange', onStoreChange);
}

export default function PasswordResetPage() {
  const router = useRouter();
  const hashToken = useSyncExternalStore(subscribeHash, readRecoveryAccessToken, () => null);
  const [consumed, setConsumed] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const accessToken = consumed ? null : hashToken;

  const canSubmit = useMemo(
    () => Boolean(accessToken) && password.length >= 8 && password === confirm && !loading,
    [accessToken, password, confirm, loading]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!accessToken) {
      setError('This reset link is invalid or has expired. Request a new password reset email.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to update password');
      }
      setMessage('Password updated. You can sign in with your new password.');
      setConsumed(true);
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', window.location.pathname);
      }
      setTimeout(() => router.replace('/'), 1200);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg-main)] p-6">
      <div className="w-full max-w-md bg-[var(--bg-panel)] border border-white/10 rounded-2xl p-8">
        <h1 className="text-2xl font-extrabold text-white tracking-tight mb-2">Reset password</h1>
        <p className="text-sm text-zinc-400 mb-6">
          Choose a new password for your OmniAgent account. Recovery tokens are handled only on this page and are not stored after submit.
        </p>

        {!accessToken && !message && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
            No valid recovery session was found. Open the reset link from your email, or request a new one from the sign-in page.
          </div>
        )}

        {(error || message) && (
          <div
            className={`mb-6 p-4 rounded-xl text-sm ${
              error
                ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                : 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-300'
            }`}
          >
            {error || message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">New password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500/50"
            />
          </label>
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3 px-4 bg-white text-zinc-950 font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/" className="text-sm text-cyan-400 hover:text-cyan-300">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
