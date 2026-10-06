import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { DatabaseStore } from '@/lib/db/store';
import { isUserActive } from '@/lib/auth/rbac';
import { getAdminEmail } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('omniagent_session')?.value;
  if (!token) {
    redirect('/');
  }

  const user = await DatabaseStore.verifySessionToken(token);
  if (!user || !isUserActive(user)) {
    redirect('/');
  }

  const configuredAdminEmail = getAdminEmail();
  const isConfiguredAdmin =
    Boolean(configuredAdminEmail) && user.email.toLowerCase() === configuredAdminEmail!.toLowerCase();

  if (user.role !== 'admin' && !isConfiguredAdmin) {
    redirect('/workspace');
  }

  return <>{children}</>;
}
