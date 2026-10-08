import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LAST_ADMIN_ERROR,
  countActiveAdmins,
  matchesUserQuery,
  mergeAuthUsersWithProfiles,
  uniqueUserCount,
  wouldRemoveActiveAdmin,
} from './users-sync';
import type { User } from '../types';

function profile(partial: Partial<User> & { id: string; email: string }): User {
  return {
    role: 'developer',
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    full_name: partial.email.split('@')[0],
    ...partial,
  };
}

describe('Auth directory merge and unique counts', () => {
  it('lists every Auth user even when a profile is missing', () => {
    const merged = mergeAuthUsersWithProfiles(
      [
        { id: 'auth-admin', email: 'riyadsarkar1243@gmail.com', created_at: '2026-01-01T00:00:00.000Z' },
        { id: 'auth-user', email: 'riyadsharkar12431243@gmail.com', last_sign_in_at: '2026-02-01T00:00:00.000Z' },
      ],
      [profile({ id: 'auth-admin', email: 'riyadsarkar1243@gmail.com', role: 'admin' })],
      'riyadsarkar1243@gmail.com'
    );
    assert.equal(merged.total, 2);
    assert.equal(merged.users.length, 2);
    assert.deepEqual(merged.missingProfileIds, ['auth-user']);
    assert.equal(merged.users.find((u) => u.id === 'auth-admin')?.role, 'admin');
    assert.equal(merged.users.find((u) => u.id === 'auth-user')?.role, 'developer');
    assert.equal(merged.users.find((u) => u.id === 'auth-user')?.status, 'active');
  });

  it('does not overwrite an existing profile role or status', () => {
    const merged = mergeAuthUsersWithProfiles(
      [{ id: 'u1', email: 'member@example.com' }],
      [profile({ id: 'u1', email: 'member@example.com', role: 'viewer', status: 'disabled' })],
      'admin@example.com'
    );
    assert.equal(merged.users[0].role, 'viewer');
    assert.equal(merged.users[0].status, 'disabled');
  });

  it('counts unique authenticated user ids and ignores duplicates', () => {
    assert.equal(
      uniqueUserCount([
        { id: 'a' },
        { id: 'b' },
        { id: 'a' },
        { id: '' },
      ]),
      2
    );
  });

  it('matches search against email, name, and id', () => {
    const user = profile({ id: 'usr_abc', email: 'ada@example.com', full_name: 'Ada Lovelace' });
    assert.equal(matchesUserQuery(user, 'ada@'), true);
    assert.equal(matchesUserQuery(user, 'Lovelace'), true);
    assert.equal(matchesUserQuery(user, 'usr_abc'), true);
    assert.equal(matchesUserQuery(user, 'missing'), false);
  });
});

describe('last-admin protection', () => {
  it('counts only active admins', () => {
    assert.equal(
      countActiveAdmins([
        { role: 'admin', status: 'active' },
        { role: 'admin', status: 'disabled' },
        { role: 'developer', status: 'active' },
      ]),
      1
    );
  });

  it('detects demote and disable of an active admin', () => {
    const admin = { role: 'admin' as const, status: 'active' as const };
    assert.equal(wouldRemoveActiveAdmin(admin, { role: 'developer' }), true);
    assert.equal(wouldRemoveActiveAdmin(admin, { status: 'disabled' }), true);
    assert.equal(wouldRemoveActiveAdmin(admin, { role: 'admin' }), false);
    assert.equal(wouldRemoveActiveAdmin({ role: 'developer', status: 'active' }, { role: 'admin' }), false);
  });

  it('uses the required last-admin error message', () => {
    assert.equal(
      LAST_ADMIN_ERROR,
      'You cannot remove the last administrator. Promote another user to admin first.'
    );
  });
});
