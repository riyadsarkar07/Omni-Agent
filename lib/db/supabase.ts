import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { isProduction } from '../config';

let adminClient: SupabaseClient | null | undefined;
let authClient: SupabaseClient | null | undefined;

function supabaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null;
}

function serviceRoleKey(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

function anonKey(): string | null {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || null;
}

export function isSupabaseConfigured(): boolean {
  if (isProduction()) {
    return Boolean(supabaseUrl() && serviceRoleKey());
  }
  return Boolean(supabaseUrl() && (serviceRoleKey() || anonKey()));
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = supabaseUrl();
  const key = serviceRoleKey() || (!isProduction() ? anonKey() : null);
  if (!url || !key) {
    adminClient = null;
    return adminClient;
  }
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return adminClient;
}

export function getSupabaseAuth(): SupabaseClient | null {
  if (authClient !== undefined) return authClient;
  const url = supabaseUrl();
  const key = anonKey() || (!isProduction() ? serviceRoleKey() : null);
  if (!url || !key) {
    authClient = null;
    return authClient;
  }
  authClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return authClient;
}

export const DEFAULT_PROJECT_ID = 'da1a0000-0000-4000-8000-000000000001';
export const DEFAULT_PROJECT_SLUG = 'core-platform';
