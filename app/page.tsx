'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/auth/session-client';
import { AuthView } from '@/components/auth/AuthView';

export default function HomePage() {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);

  useEffect(() => {
    let ignore = false;
    apiFetch('/api/auth/me')
      .then(async (res) => {
        const data = await res.json();
        if (ignore) return;
        if (data.authenticated && data.user) {
          router.replace(data.user.role === 'admin' ? '/admin' : '/workspace');
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (!ignore) setReady(true);
      });
    return () => {
      ignore = true;
    };
  }, [router]);

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--bg-main)]">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <AuthView
      onLoginSuccess={(user) => {
        window.location.href = user.role === 'admin' ? '/admin' : '/workspace';
      }}
    />
  );
}
