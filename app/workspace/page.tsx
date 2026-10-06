'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { UserWorkspace } from '@/components/workspace/UserWorkspace';
import { apiFetch, clearSessionToken } from '@/lib/auth/session-client';

export default function WorkspacePage() {
  return (
    <AuthGate>
      {(user, setUser) => (
        <UserWorkspace
          currentUser={user}
          onUserUpdated={(next) => setUser(next)}
          onLogout={async () => {
            await apiFetch('/api/auth/logout', { method: 'POST' });
            clearSessionToken();
            setUser(null);
          }}
        />
      )}
    </AuthGate>
  );
}
