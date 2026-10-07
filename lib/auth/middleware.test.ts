import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { DatabaseStore } from '../db/store';
import { authenticateApiRequest, verifyEmergencyAdminSecret } from './middleware';
import { hasAdminPrivileges, requireAdmin } from './rbac';

const ORIGINAL_ADMIN_SECRET = process.env.ADMIN_SECRET;
const ORIGINAL_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const EMERGENCY_SECRET = 'test-emergency-admin-secret-value';

function requestWith(headers: Record<string, string>, cookies?: Record<string, string>): NextRequest {
  const req = new NextRequest('http://localhost/api/v1/admin/overview', { headers });
  if (cookies) {
    for (const [name, value] of Object.entries(cookies)) {
      req.cookies.set(name, value);
    }
  }
  return req;
}

describe('x-admin-secret isolation', () => {
  before(() => {
    process.env.ADMIN_SECRET = EMERGENCY_SECRET;
    process.env.ADMIN_EMAIL = 'admin@example.com';
  });

  after(() => {
    if (ORIGINAL_ADMIN_SECRET === undefined) {
      delete process.env.ADMIN_SECRET;
    } else {
      process.env.ADMIN_SECRET = ORIGINAL_ADMIN_SECRET;
    }
    if (ORIGINAL_ADMIN_EMAIL === undefined) {
      delete process.env.ADMIN_EMAIL;
    } else {
      process.env.ADMIN_EMAIL = ORIGINAL_ADMIN_EMAIL;
    }
  });

  it('verifies the emergency secret without granting a session', () => {
    assert.equal(verifyEmergencyAdminSecret(EMERGENCY_SECRET), true);
    assert.equal(verifyEmergencyAdminSecret('wrong-secret'), false);
    assert.equal(verifyEmergencyAdminSecret(null), false);
    assert.equal(verifyEmergencyAdminSecret(''), false);
  });

  it('does not authenticate a request that only sends x-admin-secret', async () => {
    const { auth, errorResponse } = await authenticateApiRequest(
      requestWith({ 'x-admin-secret': EMERGENCY_SECRET })
    );
    assert.equal(auth, undefined);
    assert.ok(errorResponse);
    assert.equal(errorResponse.status, 401);
    assert.equal(hasAdminPrivileges(auth), false);
  });

  it('does not let x-admin-secret promote an API-key request to admin', async () => {
    const { auth, errorResponse } = await authenticateApiRequest(
      requestWith({
        'x-api-key': 'ua_live_demo_development_key_2026',
        'x-admin-secret': EMERGENCY_SECRET,
      })
    );
    assert.equal(errorResponse, undefined);
    assert.ok(auth);
    assert.equal(auth.isAdmin, false);
    assert.equal(auth.user, undefined);
    assert.equal(hasAdminPrivileges(auth), false);
    const denied = requireAdmin(auth);
    assert.ok(denied);
    assert.equal(denied.status, 401);
  });

  it('does not let x-admin-secret promote a non-admin user session', async () => {
    const session = await DatabaseStore.registerUser(
      `member-${Date.now()}@example.com`,
      'password123',
      'Member'
    );
    const { auth, errorResponse } = await authenticateApiRequest(
      requestWith(
        { 'x-admin-secret': EMERGENCY_SECRET },
        { omniagent_session: session.token }
      )
    );
    assert.equal(errorResponse, undefined);
    assert.ok(auth?.user);
    assert.equal(auth.user.role, 'developer');
    assert.equal(auth.isAdmin, false);
    assert.equal(hasAdminPrivileges(auth), false);
    const denied = requireAdmin(auth);
    assert.ok(denied);
    assert.equal(denied.status, 403);
  });

  it('grants admin only for an authenticated admin user session', async () => {
    const session = await DatabaseStore.registerUser(
      process.env.ADMIN_EMAIL!,
      'admin-password-123',
      'Admin'
    );
    const { auth, errorResponse } = await authenticateApiRequest(
      requestWith({}, { omniagent_session: session.token })
    );
    assert.equal(errorResponse, undefined);
    assert.ok(auth?.user);
    assert.equal(auth.isAdmin, true);
    assert.equal(hasAdminPrivileges(auth), true);
    assert.equal(requireAdmin(auth), null);
  });
});
