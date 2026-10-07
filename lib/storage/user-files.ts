import fs from 'fs/promises';
import path from 'path';

const ROOT = path.join(process.cwd(), 'data', 'user-files');
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export function toStoragePath(userId: string, fileId: string): string {
  if (!SAFE_SEGMENT.test(userId) || !SAFE_SEGMENT.test(fileId)) {
    throw new Error('Invalid storage path');
  }
  return `${userId}/${fileId}.bin`;
}

function resolveOwnedPath(storagePath: string, userId: string): string | null {
  const normalized = storagePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const [owner, filename] = parts;
  if (owner !== userId) return null;
  if (!SAFE_SEGMENT.test(owner) || !SAFE_SEGMENT.test(filename)) return null;
  if (!filename.endsWith('.bin')) return null;
  const full = path.resolve(ROOT, owner, filename);
  const expectedRoot = path.resolve(ROOT, owner);
  if (full !== expectedRoot && !full.startsWith(expectedRoot + path.sep)) return null;
  return full;
}

export async function writeOwnedFile(userId: string, fileId: string, bytes: Buffer): Promise<string> {
  const storagePath = toStoragePath(userId, fileId);
  const full = resolveOwnedPath(storagePath, userId);
  if (!full) throw new Error('Invalid storage path');
  await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await fs.writeFile(full, bytes, { mode: 0o600 });
  return storagePath;
}

export async function readOwnedFile(storagePath: string, userId: string): Promise<Buffer | null> {
  const full = resolveOwnedPath(storagePath, userId);
  if (!full) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}

export async function deleteOwnedFile(storagePath: string, userId: string): Promise<void> {
  const full = resolveOwnedPath(storagePath, userId);
  if (!full) return;
  try {
    await fs.unlink(full);
  } catch {
    //
  }
}
