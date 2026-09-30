function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === 'production';
  }
  return process.env.NODE_ENV === 'production' && process.env.VERCEL === '1';
}

function readRequiredSecret(name: string): string | null {
  const value = process.env[name]?.trim() || '';
  return value ? value : null;
}

export function isProduction(): boolean {
  return isProductionRuntime();
}

export function getAppUrl(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (isProductionRuntime()) {
    return 'https://omniagent-amber.vercel.app';
  }
  return 'http://localhost:3000';
}

export function absoluteUrl(path = '/'): string {
  const base = getAppUrl();
  if (!path || path === '/') {
    return `${base}/`;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getAdminEmail(): string | null {
  return readRequiredSecret('ADMIN_EMAIL');
}

export function getAdminPassword(): string | null {
  return readRequiredSecret('ADMIN_PASSWORD');
}

export function getAdminSecret(): string | null {
  return readRequiredSecret('ADMIN_SECRET');
}

export function getApiKeyHashSecret(): string | null {
  return readRequiredSecret('API_KEY_HASH_SECRET');
}

export function getGeminiModel(): string | null {
  return readRequiredSecret('GEMINI_MODEL');
}

export function isSupabaseProductionReady(): boolean {
  return Boolean(
    readRequiredSecret('NEXT_PUBLIC_SUPABASE_URL') && readRequiredSecret('SUPABASE_SERVICE_ROLE_KEY')
  );
}

export function assertProductionSecret(name: string): string {
  const value = readRequiredSecret(name);
  if (value) {
    return value;
  }
  if (isProductionRuntime()) {
    throw new Error(`Missing required production secret: ${name}`);
  }
  throw new Error(`Missing required secret: ${name}`);
}
