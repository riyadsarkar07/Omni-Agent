'use client';

import React from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { AdminConsole } from '@/components/admin/AdminConsole';

export default function AdminPage() {
  return (
    <AuthGate requireAdmin>
      {(user) => <AdminConsole currentUser={user} />}
    </AuthGate>
  );
}
