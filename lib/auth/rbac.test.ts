import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canAccessConversation,
  canExecuteAgent,
  canManageAgent,
  hasAdminPrivileges,
  isAdminUser,
  requireAdmin,
  requireSessionUser,
} from './rbac';
import type { User } from '../types';

const adminUser: User = {
  id: 'usr_admin',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
  created_at: new Date().toISOString(),
};

const memberUser: User = {
  id: 'usr_member',
  email: 'user@example.com',
  role: 'developer',
  status: 'active',
  created_at: new Date().toISOString(),
};

const disabledAdmin: User = {
  ...adminUser,
  id: 'usr_disabled_admin',
  status: 'disabled',
};

describe('RBAC admin privileges', () => {
  it('does not grant admin without an authenticated user session', () => {
    assert.equal(hasAdminPrivileges({ isAdmin: true }), false);
    assert.equal(hasAdminPrivileges({ isAdmin: true, user: null }), false);
    assert.equal(hasAdminPrivileges({ isAdmin: true, user: undefined }), false);
    assert.equal(hasAdminPrivileges(undefined), false);
  });

  it('requires a valid authenticated admin user for isAdmin', () => {
    assert.equal(hasAdminPrivileges({ isAdmin: true, user: adminUser }), true);
    assert.equal(hasAdminPrivileges({ isAdmin: false, user: adminUser }), false);
    assert.equal(hasAdminPrivileges({ isAdmin: true, user: memberUser }), false);
    assert.equal(hasAdminPrivileges({ isAdmin: false, user: memberUser }), false);
    assert.equal(hasAdminPrivileges({ isAdmin: true, user: disabledAdmin }), false);
  });

  it('requireAdmin rejects secret-style auth with no session user', async () => {
    const missing = requireAdmin(undefined);
    assert.ok(missing);
    assert.equal(missing.status, 401);

    const headerOnly = requireAdmin({ isAdmin: true });
    assert.ok(headerOnly);
    assert.equal(headerOnly.status, 401);
    const body = await headerOnly.json();
    assert.match(body.message, /signed-in admin session/i);
  });

  it('requireAdmin allows an authenticated admin session', () => {
    assert.equal(requireAdmin({ isAdmin: true, user: adminUser }), null);
  });

  it('requireAdmin forbids a signed-in non-admin user', async () => {
    const denied = requireAdmin({ isAdmin: false, user: memberUser });
    assert.ok(denied);
    assert.equal(denied.status, 403);
  });

  it('requireSessionUser rejects unauthenticated requests', async () => {
    const denied = requireSessionUser({ isAdmin: true });
    assert.ok(denied);
    assert.equal(denied.status, 401);
  });

  it('isAdminUser only inspects the user role', () => {
    assert.equal(isAdminUser(adminUser), true);
    assert.equal(isAdminUser(memberUser), false);
    assert.equal(isAdminUser(null), false);
  });
});

describe('conversation and agent access', () => {
  const conversation = {
    project_id: 'proj_default_core',
    metadata: { owner_id: 'usr_member' },
  };

  it('does not let isAdmin without a user bypass conversation ownership', () => {
    assert.equal(
      canAccessConversation({ isAdmin: true, project: { id: 'other' } }, conversation),
      false
    );
    assert.equal(
      canAccessConversation({ isAdmin: true, user: adminUser, project: { id: 'other' } }, conversation),
      true
    );
    assert.equal(
      canAccessConversation({ isAdmin: false, user: memberUser }, conversation),
      true
    );
  });

  it('does not let isAdmin without a user bypass unpublished agents', () => {
    const unpublished = { is_published: false, project_id: 'proj_default_core' };
    assert.equal(canExecuteAgent({ isAdmin: true, project: { id: 'proj_default_core' } }, unpublished), false);
    assert.equal(
      canExecuteAgent({ isAdmin: true, user: adminUser, project: { id: 'proj_default_core' } }, unpublished),
      true
    );
    assert.equal(
      canExecuteAgent({ isAdmin: false, project: { id: 'proj_default_core' } }, unpublished),
      false
    );
    assert.equal(
      canExecuteAgent({ isAdmin: false, user: memberUser }, { is_published: true, project_id: 'other' }),
      true
    );
  });

  it('lets owners manage only their user-scoped agents', () => {
    const owned = { owner_id: memberUser.id, scope: 'user' as const };
    const platform = { owner_id: null, scope: 'platform' as const };
    const otherUser = { owner_id: 'usr_other', scope: 'user' as const };
    assert.equal(canManageAgent({ user: memberUser }, owned), true);
    assert.equal(canManageAgent({ user: memberUser }, platform), false);
    assert.equal(canManageAgent({ user: memberUser }, otherUser), false);
    assert.equal(canManageAgent({ isAdmin: true, user: adminUser }, platform), true);
    assert.equal(canManageAgent({ isAdmin: true }, owned), false);
  });

  it('lets owners execute their unpublished user agents', () => {
    const owned = { is_published: false, owner_id: memberUser.id, scope: 'user' };
    assert.equal(canExecuteAgent({ user: memberUser }, owned), true);
    assert.equal(canExecuteAgent({ user: adminUser }, owned), false);
    assert.equal(canExecuteAgent({ isAdmin: true, user: adminUser }, owned), true);
  });
});
