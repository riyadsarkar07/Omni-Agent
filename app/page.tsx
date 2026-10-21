'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/auth/session-client';
import { AuthView } from '@/components/auth/AuthView';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let ignore = false;
    apiFetch('/api/auth/me', { timeoutMs: 8000 })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (ignore || !data?.authenticated || !data.user) return;
        router.replace(data.user.role === 'admin' ? '/admin' : '/workspace');
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [router]);

  return (
    <AuthView
      onLoginSuccess={(user) => {
        window.location.href = user.role === 'admin' ? '/admin' : '/workspace';
      }}
    />
  );
}
