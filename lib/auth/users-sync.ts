import { User, UserPreferences, UserRole, UserStatus } from '../types';

export interface AuthDirectoryUser {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

export function defaultUserPreferences(raw?: unknown): UserPreferences {
  const value = raw && typeof raw === 'object' ? (raw as UserPreferences) : {};
  return {
    default_model: value.default_model || null,
    default_provider_id: value.default_provider_id || null,
    appearance: value.appearance === 'light' || value.appearance === 'dark' ? value.appearance : 'system',
    memory_enabled: value.memory_enabled !== false,
    monthly_request_quota: typeof value.monthly_request_quota === 'number' ? value.monthly_request_quota : 500,
  };
}

export function displayNameFromEmail(email?: string | null): string {
  const value = String(email || '').trim();
  if (!value) return 'User';
  return value.split('@')[0] || 'User';
}

export function mergeAuthUserWithProfile(
  authUser: AuthDirectoryUser,
  profile?: User | null,
  adminEmail?: string | null
): User {
  const email = String(profile?.email || authUser.email || '').toLowerCase();
  const isBootstrapAdmin =
    Boolean(adminEmail) && email && email === adminEmail!.toLowerCase();
  const metadataName =
    typeof authUser.user_metadata?.full_name === 'string' ? authUser.user_metadata.full_name : '';

  if (profile) {
    return {
      ...profile,
      email: profile.email || email,
      full_name: profile.full_name || metadataName || displayNameFromEmail(email),
      last_active_at: profile.last_active_at || authUser.last_sign_in_at || null,
      created_at: profile.created_at || authUser.created_at || profile.created_at,
      email_confirmed: Boolean(authUser.email_confirmed_at) || profile.email_confirmed,
      preferences: defaultUserPreferences(profile.preferences),
    };
  }

  const role: UserRole = isBootstrapAdmin ? 'admin' : 'developer';
  return {
    id: authUser.id,
    email,
    full_name: metadataName || displayNameFromEmail(email),
    role,
    status: 'active',
    last_active_at: authUser.last_sign_in_at || null,
    created_at: authUser.created_at || new Date().toISOString(),
    email_confirmed: Boolean(authUser.email_confirmed_at),
    preferences: defaultUserPreferences(),
  };
}

export function mergeAuthUsersWithProfiles(
  authUsers: AuthDirectoryUser[],
  profiles: User[],
  adminEmail?: string | null
): { users: User[]; missingProfileIds: string[]; total: number } {
  const profileById = new Map<string, User>();
  for (const profile of profiles) {
    if (profile?.id && !profileById.has(profile.id)) {
      profileById.set(profile.id, profile);
    }
  }

  const seen = new Set<string>();
  const users: User[] = [];
  const missingProfileIds: string[] = [];

  for (const authUser of authUsers) {
    if (!authUser?.id || seen.has(authUser.id)) continue;
    seen.add(authUser.id);
    const profile = profileById.get(authUser.id) || null;
    if (!profile) missingProfileIds.push(authUser.id);
    users.push(mergeAuthUserWithProfile(authUser, profile, adminEmail));
  }

  return { users, missingProfileIds, total: users.length };
}

export function uniqueUserCount(users: Array<{ id: string }>): number {
  const seen = new Set<string>();
  for (const user of users) {
    if (user?.id) seen.add(user.id);
  }
  return seen.size;
}

export function matchesUserQuery(user: User, query?: string): boolean {
  const needle = query?.trim().toLowerCase();
  if (!needle) return true;
  return (
    user.email.toLowerCase().includes(needle) ||
    (user.full_name || '').toLowerCase().includes(needle) ||
    user.id.toLowerCase().includes(needle)
  );
}

export function countActiveAdmins(users: Array<Pick<User, 'role' | 'status'>>): number {
  return users.filter((user) => user.role === 'admin' && user.status !== 'disabled').length;
}

export function wouldRemoveActiveAdmin(
  existing: Pick<User, 'role' | 'status'>,
  updates: { role?: UserRole; status?: UserStatus }
): boolean {
  const wasActiveAdmin = existing.role === 'admin' && existing.status !== 'disabled';
  if (!wasActiveAdmin) return false;
  const nextRole = updates.role ?? existing.role;
  const nextStatus = updates.status ?? existing.status;
  return !(nextRole === 'admin' && nextStatus !== 'disabled');
}

export const LAST_ADMIN_ERROR =
  'You cannot remove the last administrator. Promote another user to admin first.';
