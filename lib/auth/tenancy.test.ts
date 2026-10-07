import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { DatabaseStore } from '../db/store';
import { authenticateApiRequest } from './middleware';
import { canAccessConversation, canExecuteAgent, hasAdminPrivileges, requireAdmin } from './rbac';
import { GET as getMe } from '../../app/api/auth/me/route';
import { GET as getUsage } from '../../app/api/v1/usage/route';
import { GET as getAgents } from '../../app/api/v1/agents/route';
import { GET as getAgentById } from '../../app/api/v1/agents/[id]/route';
import { GET as getConversation } from '../../app/api/v1/conversations/[id]/route';
import { GET as getProviders } from '../../app/api/v1/providers/route';
import { GET as getApiKeys } from '../../app/api/v1/api-keys/route';
import { GET as getAdminOverview } from '../../app/api/v1/admin/overview/route';
import { POST as postMusic } from '../../app/api/creative/music/route';

const ORIGINAL_ADMIN_SECRET = process.env.ADMIN_SECRET;
const ORIGINAL_ADMIN_EMAIL = process.env.ADMIN_EMAIL;

function requestWith(
  url: string,
  headers: Record<string, string> = {},
  cookies?: Record<string, string>
): NextRequest {
  const req = new NextRequest(url, { headers });
  if (cookies) {
    for (const [name, value] of Object.entries(cookies)) {
      req.cookies.set(name, value);
    }
  }
  return req;
}

describe('production tenancy and API security', () => {
  before(() => {
    process.env.ADMIN_SECRET = 'test-emergency-admin-secret-value';
    process.env.ADMIN_EMAIL = `admin-${Date.now()}@example.com`;
  });

  after(() => {
    if (ORIGINAL_ADMIN_SECRET === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = ORIGINAL_ADMIN_SECRET;
    if (ORIGINAL_ADMIN_EMAIL === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = ORIGINAL_ADMIN_EMAIL;
  });

  it('treats disabled users as unauthenticated on /api/auth/me', async () => {
    const session = await DatabaseStore.registerUser(`disabled-${Date.now()}@example.com`, 'password123', 'Disabled');
    await DatabaseStore.updateUser(session.user.id, { status: 'disabled' });
    const res = await getMe(requestWith('http://localhost/api/auth/me', {}, { omniagent_session: session.token }));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.authenticated, false);
    assert.equal(body.user, null);
  });

  it('rejects disabled users from protected APIs', async () => {
    const session = await DatabaseStore.registerUser(`disabled-api-${Date.now()}@example.com`, 'password123', 'Disabled');
    await DatabaseStore.updateUser(session.user.id, { status: 'disabled' });
    const { auth, errorResponse } = await authenticateApiRequest(
      requestWith('http://localhost/api/v1/usage', {}, { omniagent_session: session.token })
    );
    assert.equal(auth, undefined);
    assert.ok(errorResponse);
    assert.equal(errorResponse.status, 403);
  });

  it('scopes conversations to the owner and hides them from other users', async () => {
    const owner = await DatabaseStore.registerUser(`owner-${Date.now()}@example.com`, 'password123', 'Owner');
    const other = await DatabaseStore.registerUser(`other-${Date.now()}@example.com`, 'password123', 'Other');
    const conversation = await DatabaseStore.getOrCreateConversation(
      undefined,
      'proj_default_core',
      'agent_general_assistant',
      'Owner chat',
      owner.user.id
    );
    const own = await getConversation(requestWith(`http://localhost/api/v1/conversations/${conversation.id}`, {}, { omniagent_session: owner.token }), {
      params: Promise.resolve({ id: conversation.id }),
    });
    assert.equal(own.status, 200);
    const stolen = await getConversation(requestWith(`http://localhost/api/v1/conversations/${conversation.id}`, {}, { omniagent_session: other.token }), {
      params: Promise.resolve({ id: conversation.id }),
    });
    assert.equal(stolen.status, 404);
    assert.equal(
      canAccessConversation({ user: other.user, project: { id: 'proj_default_core' } }, conversation),
      false
    );
  });

  it('lets normal users execute published agents but not unpublished ones', async () => {
    const user = await DatabaseStore.registerUser(`member-${Date.now()}@example.com`, 'password123', 'Member');
    const published = await getAgentById(requestWith('http://localhost/api/v1/agents/agent_general_assistant', {}, { omniagent_session: user.token }), {
      params: Promise.resolve({ id: 'agent_general_assistant' }),
    });
    assert.equal(published.status, 200);
    const unpublished = await DatabaseStore.createAgent({
      project_id: 'proj_default_core',
      name: 'Private Draft',
      description: 'unpublished',
      model: 'gemini-3.8-flash',
      system_instructions: 'You are a private unpublished assistant.',
      temperature: 0.7,
      top_p: 0.95,
      top_k: 40,
      memory_enabled: true,
      tools_enabled: [],
      is_published: false,
    });
    const hidden = await getAgentById(requestWith(`http://localhost/api/v1/agents/${unpublished.id}`, {}, { omniagent_session: user.token }), {
      params: Promise.resolve({ id: unpublished.id }),
    });
    assert.equal(hidden.status, 404);
    assert.equal(canExecuteAgent({ user: user.user }, unpublished), false);
    assert.equal(canExecuteAgent({ user: user.user }, { is_published: true }), true);
  });

  it('blocks normal users from admin APIs and x-admin-secret cannot mint admin', async () => {
    const user = await DatabaseStore.registerUser(`user-admin-${Date.now()}@example.com`, 'password123', 'User');
    const providers = await getProviders(requestWith('http://localhost/api/v1/providers', { 'x-admin-secret': process.env.ADMIN_SECRET! }, { omniagent_session: user.token }));
    assert.equal(providers.status, 403);
    const keys = await getApiKeys(requestWith('http://localhost/api/v1/api-keys', {}, { omniagent_session: user.token }));
    assert.equal(keys.status, 403);
    const overview = await getAdminOverview(requestWith('http://localhost/api/v1/admin/overview', { 'x-admin-secret': process.env.ADMIN_SECRET! }));
    assert.ok([401, 403].includes(overview.status));
    assert.equal(hasAdminPrivileges({ isAdmin: true }), false);
    assert.ok(requireAdmin({ isAdmin: true }));
  });

  it('scopes usage to the current user', async () => {
    const alice = await DatabaseStore.registerUser(`alice-${Date.now()}@example.com`, 'password123', 'Alice');
    const bob = await DatabaseStore.registerUser(`bob-${Date.now()}@example.com`, 'password123', 'Bob');
    await DatabaseStore.logUsage({
      project_id: 'proj_default_core',
      agent_id: 'agent_general_assistant',
      api_key_id: null,
      user_id: alice.user.id,
      endpoint: '/api/v1/chat',
      model: 'gemini-3.8-flash',
      prompt_tokens: 10,
      candidate_tokens: 20,
      total_tokens: 30,
      status_code: 200,
      latency_ms: 12,
      error_message: null,
    });
    const aliceRes = await getUsage(requestWith('http://localhost/api/v1/usage', {}, { omniagent_session: alice.token }));
    const bobRes = await getUsage(requestWith('http://localhost/api/v1/usage', {}, { omniagent_session: bob.token }));
    const aliceBody = await aliceRes.json();
    const bobBody = await bobRes.json();
    assert.ok(aliceBody.summary.totalRequests >= 1);
    assert.equal(bobBody.summary.totalRequests, 0);
  });

  it('requires authentication for creative APIs', async () => {
    const res = await postMusic(requestWith('http://localhost/api/creative/music'));
    assert.equal(res.status, 401);
  });

  it('does not list unpublished agents for normal users', async () => {
    const user = await DatabaseStore.registerUser(`agent-list-${Date.now()}@example.com`, 'password123', 'User');
    const res = await getAgents(requestWith('http://localhost/api/v1/agents', {}, { omniagent_session: user.token }));
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(body.agents));
    assert.equal(body.agents.every((agent: { is_published: boolean }) => agent.is_published), true);
  });
});
