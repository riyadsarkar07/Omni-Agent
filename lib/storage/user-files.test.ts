import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOwnedStoragePath, toStoragePath } from './user-files';

describe('owned storage path protection', () => {
  it('builds owner-scoped paths and rejects traversal', () => {
    const path = toStoragePath('usr_abc', 'file_123', 'notes.txt');
    assert.equal(path, 'usr_abc/file_123/notes.txt');
    assert.throws(() => toStoragePath('../etc', 'file_123', 'notes.txt'));
    assert.throws(() => toStoragePath('usr_abc', '../passwd', 'notes.txt'));
  });

  it('only parses paths owned by the requesting user', () => {
    assert.deepEqual(parseOwnedStoragePath('usr_abc/file_123/notes.txt', 'usr_abc'), {
      userId: 'usr_abc',
      fileId: 'file_123',
      filename: 'notes.txt',
    });
    assert.equal(parseOwnedStoragePath('usr_abc/file_123/notes.txt', 'usr_other'), null);
    assert.equal(parseOwnedStoragePath('usr_abc/../usr_other/secret.bin', 'usr_abc'), null);
    assert.equal(parseOwnedStoragePath('/etc/passwd', 'usr_abc'), null);
    assert.equal(parseOwnedStoragePath('usr_abc/file_123/../../etc/passwd', 'usr_abc'), null);
  });
});
