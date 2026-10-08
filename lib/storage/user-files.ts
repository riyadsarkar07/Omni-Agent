import fs from 'fs/promises';
import path from 'path';
import { getSupabaseAdmin } from '../db/supabase';

const LOCAL_ROOT = path.join(process.cwd(), 'data', 'user-files');
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;
export const USER_FILES_BUCKET = 'user-files';

function sanitizeFilename(name: string): string {
  const base = path.basename(name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 180);
  return base || 'file';
}

export function toStoragePath(userId: string, fileId: string, filename = 'file.bin'): string {
  if (!SAFE_SEGMENT.test(userId) || !SAFE_SEGMENT.test(fileId)) {
    throw new Error('Invalid storage path');
  }
  return `${userId}/${fileId}/${sanitizeFilename(filename)}`;
}

export function parseOwnedStoragePath(storagePath: string, userId: string): { userId: string; fileId: string; filename: string } | null {
  const normalized = storagePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized.includes('..')) return null;
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 3) {
    const [owner, fileId, filename] = parts;
    if (owner !== userId) return null;
    if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(fileId) || !SAFE_SEGMENT.test(filename)) return null;
    return { userId: owner, fileId, filename };
  }
  if (parts.length === 2) {
    const [owner, filename] = parts;
    if (owner !== userId) return null;
    if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(filename)) return null;
    const fileId = filename.replace(/\.bin$/, '');
    return { userId: owner, fileId, filename };
  }
  return null;
}

function resolveLocalPath(storagePath: string, userId: string): string | null {
  const parsed = parseOwnedStoragePath(storagePath, userId);
  if (!parsed) return null;
  const parts = storagePath.replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter(Boolean);
  const full =
    parts.length === 2
      ? path.resolve(LOCAL_ROOT, parsed.userId, parsed.filename)
      : path.resolve(LOCAL_ROOT, parsed.userId, parsed.fileId, parsed.filename);
  const expectedRoot = path.resolve(LOCAL_ROOT, parsed.userId);
  if (full !== expectedRoot && !full.startsWith(expectedRoot + path.sep)) return null;
  return full;
}

async function ensurePrivateBucket(): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  try {
    const { data } = await admin.storage.getBucket(USER_FILES_BUCKET);
    if (data) return true;
  } catch {
    //
  }
  try {
    const { error } = await admin.storage.createBucket(USER_FILES_BUCKET, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
    });
    if (error && !/already exists/i.test(error.message)) {
      console.error('Failed to create private storage bucket:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to ensure private storage bucket:', err);
    return false;
  }
}

export async function writeOwnedFile(userId: string, fileId: string, bytes: Buffer, filename = 'file.bin'): Promise<string> {
  const storagePath = toStoragePath(userId, fileId, filename);
  const admin = getSupabaseAdmin();
  if (admin && (await ensurePrivateBucket())) {
    const { error } = await admin.storage.from(USER_FILES_BUCKET).upload(storagePath, bytes, {
      contentType: 'application/octet-stream',
      upsert: false,
    });
    if (!error) return storagePath;
    console.error('Supabase storage upload failed, falling back to local disk:', error.message);
  }

  const full = resolveLocalPath(storagePath, userId);
  if (!full) throw new Error('Invalid storage path');
  await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await fs.writeFile(full, bytes, { mode: 0o600 });
  return storagePath;
}

export async function readOwnedFile(storagePath: string, userId: string): Promise<Buffer | null> {
  const parsed = parseOwnedStoragePath(storagePath, userId);
  if (!parsed) return null;

  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      const { data, error } = await admin.storage.from(USER_FILES_BUCKET).download(storagePath);
      if (!error && data) {
        const ab = await data.arrayBuffer();
        return Buffer.from(ab);
      }
    } catch {
      //
    }
  }

  const full = resolveLocalPath(storagePath, userId);
  if (!full) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

export async function deleteOwnedFile(storagePath: string, userId: string): Promise<void> {
  const parsed = parseOwnedStoragePath(storagePath, userId);
  if (!parsed) return;

  const admin = getSupabaseAdmin();
  if (admin) {
    try {
      await admin.storage.from(USER_FILES_BUCKET).remove([storagePath]);
    } catch {
      //
    }
  }

  const full = resolveLocalPath(storagePath, userId);
  if (!full) return;
  try {
    await fs.unlink(full);
  } catch {
    //
  }
}

export function isOwnedStoragePath(storagePath: string, userId: string): boolean {
  return Boolean(parseOwnedStoragePath(storagePath, userId));
}
