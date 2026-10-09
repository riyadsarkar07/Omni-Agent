import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { NextRequest } from 'next/server';
import { DatabaseStore } from '../db/store';
import { authenticateApiRequest } from './middleware';
import { canAccessConversation, canExecuteAgent, hasAdminPrivileges, requireAdmin } from './rbac';
import { GET as getMe } from '../../app/api/auth/me/route';
import { GET as getUsage } from '../../app/api/v1/usage/route';
import { GET as getAgents, POST as postAgent } from '../../app/api/v1/agents/route';
import { GET as getAgentById, PATCH as patchAgent, DELETE as deleteAgent } from '../../app/api/v1/agents/[id]/route';
import { GET as getConversation } from '../../app/api/v1/conversations/[id]/route';
import { GET as getProviders } from '../../app/api/v1/providers/route';
import { GET as getApiKeys } from '../../app/api/v1/api-keys/route';
import { GET as getAdminOverview } from '../../app/api/v1/admin/overview/route';
import { GET as getAdminUsers } from '../../app/api/v1/admin/users/route';
import { PATCH as patchAdminUser } from '../../app/api/v1/admin/users/[id]/route';
import { LAST_ADMIN_ERROR } from './users-sync';
import { POST as postMusic } from '../../app/api/creative/music/route';
import { GET as getMemories, POST as postMemory, DELETE as deleteAllMemories } from '../../app/api/v1/memories/route';
import { DELETE as deleteMemory } from '../../app/api/v1/memories/[id]/route';
import { GET as getFiles, POST as postFile } from '../../app/api/v1/files/route';
import { GET as getFileById, DELETE as deleteFile } from '../../app/api/v1/files/[id]/route';
import { GET as getShares, POST as postShare } from '../../app/api/v1/shares/route';
import { DELETE as deleteShare } from '../../app/api/v1/shares/[id]/route';
import { DELETE as deleteConversation } from '../../app/api/v1/conversations/[id]/route';
import { POST as postChat } from '../../app/api/v1/chat/route';
import { POST as searchKnowledge } from '../../app/api/v1/knowledge/search/route';
import { uniqueUserCount } from './users-sync';

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
    assert.equal(
      body.agents.every(
        (agent: { is_published: boolean; owner_id?: string | null }) =>
          agent.is_published || agent.owner_id === user.user.id
      ),
      true
    );
  });

  it('lets a user create and manage only their own agents', async () => {
    const owner = await DatabaseStore.registerUser(`agent-owner-${Date.now()}@example.com`, 'password123', 'Owner');
    const other = await DatabaseStore.registerUser(`agent-other-${Date.now()}@example.com`, 'password123', 'Other');
    const createdWithBody = new NextRequest('http://localhost/api/v1/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'My private agent',
        description: 'owner only',
        model: 'gemini-3.8-flash',
        system_instructions: 'You are a private user agent.',
      }),
    });
    createdWithBody.cookies.set('omniagent_session', owner.token);
    const createRes = await postAgent(createdWithBody);
    assert.equal(createRes.status, 201);
    const createdBody = await createRes.json();
    const agentId = createdBody.agent.id;
    assert.equal(createdBody.agent.scope, 'user');
    assert.equal(createdBody.agent.is_published, false);
    assert.equal(createdBody.agent.owner_id, owner.user.id);

    const otherGet = await getAgentById(
      requestWith(`http://localhost/api/v1/agents/${agentId}`, {}, { omniagent_session: other.token }),
      { params: Promise.resolve({ id: agentId }) }
    );
    assert.equal(otherGet.status, 404);

    const otherPatch = new NextRequest(`http://localhost/api/v1/agents/${agentId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Hijacked' }),
    });
    otherPatch.cookies.set('omniagent_session', other.token);
    const patchRes = await patchAgent(otherPatch, { params: Promise.resolve({ id: agentId }) });
    assert.equal(patchRes.status, 404);

    const otherDelete = new NextRequest(`http://localhost/api/v1/agents/${agentId}`, { method: 'DELETE' });
    otherDelete.cookies.set('omniagent_session', other.token);
    const deleteRes = await deleteAgent(otherDelete, { params: Promise.resolve({ id: agentId }) });
    assert.equal(deleteRes.status, 404);
  });

  it('isolates memories between users', async () => {
    const owner = await DatabaseStore.registerUser(`mem-owner-${Date.now()}@example.com`, 'password123', 'Owner');
    const other = await DatabaseStore.registerUser(`mem-other-${Date.now()}@example.com`, 'password123', 'Other');
    const createReq = new NextRequest('http://localhost/api/v1/memories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'remember my private note' }),
    });
    createReq.cookies.set('omniagent_session', owner.token);
    const created = await postMemory(createReq);
    assert.equal(created.status, 201);
    const body = await created.json();
    const memoryId = body.memory.id;

    const otherList = await getMemories(requestWith('http://localhost/api/v1/memories', {}, { omniagent_session: other.token }));
    const otherBody = await otherList.json();
    assert.equal((otherBody.memories || []).some((m: { id: string }) => m.id === memoryId), false);

    const steal = new NextRequest(`http://localhost/api/v1/memories/${memoryId}`, { method: 'DELETE' });
    steal.cookies.set('omniagent_session', other.token);
    const stolen = await deleteMemory(steal, { params: Promise.resolve({ id: memoryId }) });
    assert.equal(stolen.status, 404);
  });

  it('clears only the current user memories', async () => {
    const owner = await DatabaseStore.registerUser(`mem-clear-${Date.now()}@example.com`, 'password123', 'Owner');
    const other = await DatabaseStore.registerUser(`mem-keep-${Date.now()}@example.com`, 'password123', 'Other');
    const ownerCreate = new NextRequest('http://localhost/api/v1/memories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'owner note' }),
    });
    ownerCreate.cookies.set('omniagent_session', owner.token);
    await postMemory(ownerCreate);
    const otherCreate = new NextRequest('http://localhost/api/v1/memories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'other note' }),
    });
    otherCreate.cookies.set('omniagent_session', other.token);
    await postMemory(otherCreate);

    const clearReq = new NextRequest('http://localhost/api/v1/memories', { method: 'DELETE' });
    clearReq.cookies.set('omniagent_session', owner.token);
    const cleared = await deleteAllMemories(clearReq);
    assert.equal(cleared.status, 200);

    const ownerList = await getMemories(requestWith('http://localhost/api/v1/memories', {}, { omniagent_session: owner.token }));
    const otherList = await getMemories(requestWith('http://localhost/api/v1/memories', {}, { omniagent_session: other.token }));
    const ownerBody = await ownerList.json();
    const otherBody = await otherList.json();
    assert.equal(ownerBody.total, 0);
    assert.equal(otherBody.total, 1);
  });

  it('stores files privately and blocks IDOR download/delete', async () => {
    const owner = await DatabaseStore.registerUser(`file-owner-${Date.now()}@example.com`, 'password123', 'Owner');
    const other = await DatabaseStore.registerUser(`file-other-${Date.now()}@example.com`, 'password123', 'Other');
    const form = new FormData();
    form.set('file', new File(['hello private file'], 'notes.txt', { type: 'text/plain' }));
    const uploadReq = new NextRequest('http://localhost/api/v1/files', { method: 'POST', body: form });
    uploadReq.cookies.set('omniagent_session', owner.token);
    const uploaded = await postFile(uploadReq);
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();
    assert.equal(uploadedBody.file.original_name, 'notes.txt');
    assert.equal(uploadedBody.file.storage_path, undefined);
    assert.equal(uploadedBody.analysisEnabled, true);
    assert.equal(uploadedBody.file.indexed, true);
    const fileId = uploadedBody.file.id;

    const otherList = await getFiles(requestWith('http://localhost/api/v1/files', {}, { omniagent_session: other.token }));
    const otherListBody = await otherList.json();
    assert.equal((otherListBody.files || []).some((f: { id: string }) => f.id === fileId), false);

    const stolenGet = await getFileById(
      requestWith(`http://localhost/api/v1/files/${fileId}`, {}, { omniagent_session: other.token }),
      { params: Promise.resolve({ id: fileId }) }
    );
    assert.equal(stolenGet.status, 404);

    const stealDelete = new NextRequest(`http://localhost/api/v1/files/${fileId}`, { method: 'DELETE' });
    stealDelete.cookies.set('omniagent_session', other.token);
    const stolenDelete = await deleteFile(stealDelete, { params: Promise.resolve({ id: fileId }) });
    assert.equal(stolenDelete.status, 404);

    const ownGet = await getFileById(
      requestWith(`http://localhost/api/v1/files/${fileId}`, {}, { omniagent_session: owner.token }),
      { params: Promise.resolve({ id: fileId }) }
    );
    assert.equal(ownGet.status, 200);
    assert.equal(await ownGet.text(), 'hello private file');
  });

  it('shares conversations as read-only without exposing private ownership', async () => {
    const owner = await DatabaseStore.registerUser(`share-owner-${Date.now()}@example.com`, 'password123', 'Owner');
    const other = await DatabaseStore.registerUser(`share-other-${Date.now()}@example.com`, 'password123', 'Other');
    const stranger = await DatabaseStore.registerUser(`share-stranger-${Date.now()}@example.com`, 'password123', 'Stranger');
    const conversation = await DatabaseStore.getOrCreateConversation(
      undefined,
      'proj_default_core',
      'agent_general_assistant',
      'Private owner chat',
      owner.user.id
    );

    const createShareReq = new NextRequest('http://localhost/api/v1/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resourceType: 'conversation', resourceId: conversation.id, email: other.user.email }),
    });
    createShareReq.cookies.set('omniagent_session', owner.token);
    const shared = await postShare(createShareReq);
    assert.equal(shared.status, 201);
    const shareBody = await shared.json();
    const shareId = shareBody.share.id;

    const otherGet = await getConversation(
      requestWith(`http://localhost/api/v1/conversations/${conversation.id}`, {}, { omniagent_session: other.token }),
      { params: Promise.resolve({ id: conversation.id }) }
    );
    assert.equal(otherGet.status, 200);

    const strangerGet = await getConversation(
      requestWith(`http://localhost/api/v1/conversations/${conversation.id}`, {}, { omniagent_session: stranger.token }),
      { params: Promise.resolve({ id: conversation.id }) }
    );
    assert.equal(strangerGet.status, 404);

    const otherDelete = new NextRequest(`http://localhost/api/v1/conversations/${conversation.id}`, { method: 'DELETE' });
    otherDelete.cookies.set('omniagent_session', other.token);
    const deleted = await deleteConversation(otherDelete, { params: Promise.resolve({ id: conversation.id }) });
    assert.equal(deleted.status, 404);

    const otherRevoke = new NextRequest(`http://localhost/api/v1/shares/${shareId}`, { method: 'DELETE' });
    otherRevoke.cookies.set('omniagent_session', other.token);
    const stolenRevoke = await deleteShare(otherRevoke, { params: Promise.resolve({ id: shareId }) });
    assert.equal(stolenRevoke.status, 404);

    const ownerShares = await getShares(
      requestWith(`http://localhost/api/v1/shares?resourceType=conversation&resourceId=${conversation.id}`, {}, { omniagent_session: owner.token })
    );
    const ownerShareBody = await ownerShares.json();
    assert.equal(ownerShareBody.total, 1);
  });

  it('does not let x-admin-secret authenticate chat or admin overview', async () => {
    const overview = await getAdminOverview(
      requestWith('http://localhost/api/v1/admin/overview', { 'x-admin-secret': process.env.ADMIN_SECRET! })
    );
    assert.ok([401, 403].includes(overview.status));
    const { auth, errorResponse } = await authenticateApiRequest(
      requestWith('http://localhost/api/v1/chat', { 'x-admin-secret': process.env.ADMIN_SECRET! })
    );
    assert.equal(auth, undefined);
    assert.ok(errorResponse);
    assert.equal(errorResponse.status, 401);
  });

  it('blocks demoting or disabling the last active administrator', async () => {
    const admin = await DatabaseStore.registerUser(`last-admin-${Date.now()}@example.com`, 'password123', 'Admin');
    const member = await DatabaseStore.registerUser(`last-admin-member-${Date.now()}@example.com`, 'password123', 'Member');
    await DatabaseStore.updateUser(admin.user.id, { role: 'admin' }, { enforceLastAdmin: false });
    const listedUsers = await DatabaseStore.listUsers();
    const extraAdmins = listedUsers.filter((u) => u.role === 'admin' && u.status !== 'disabled' && u.id !== admin.user.id);
    for (const extra of extraAdmins) {
      await DatabaseStore.updateUser(extra.id, { role: 'developer' }, { enforceLastAdmin: false });
    }

    const listRes = await getAdminUsers(
      requestWith('http://localhost/api/v1/admin/users', {}, { omniagent_session: admin.token })
    );
    assert.equal(listRes.status, 200);
    const listed = await listRes.json();
    assert.ok((listed.users || []).some((u: { id: string }) => u.id === admin.user.id));
    assert.ok((listed.users || []).some((u: { id: string }) => u.id === member.user.id));

    const stillAdmin = await DatabaseStore.getUserById(admin.user.id);
    assert.equal(stillAdmin?.role, 'admin');

    const demoteReq = new NextRequest(`http://localhost/api/v1/admin/users/${admin.user.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'developer' }),
    });
    demoteReq.cookies.set('omniagent_session', admin.token);
    const demoted = await patchAdminUser(demoteReq, { params: Promise.resolve({ id: admin.user.id }) });
    const demotedBody = await demoted.json();
    assert.equal(demoted.status, 409);
    assert.equal(demotedBody.error, LAST_ADMIN_ERROR);

    const disableReq = new NextRequest(`http://localhost/api/v1/admin/users/${admin.user.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'disabled' }),
    });
    disableReq.cookies.set('omniagent_session', admin.token);
    const disabled = await patchAdminUser(disableReq, { params: Promise.resolve({ id: admin.user.id }) });
    const disabledBody = await disabled.json();
    assert.equal(disabled.status, 409);
    assert.equal(disabledBody.error, LAST_ADMIN_ERROR);
  });

  it('keeps knowledge retrieval strictly user-scoped and removes it on delete', async () => {
    const owner = await DatabaseStore.registerUser(`rag-owner-${Date.now()}@example.com`, 'password123', 'Owner');
    const other = await DatabaseStore.registerUser(`rag-other-${Date.now()}@example.com`, 'password123', 'Other');
    const form = new FormData();
    form.set(
      'file',
      new File(['The secret project codeword is nebula-alpha.'], 'secret.md', { type: 'text/markdown' })
    );
    const uploadReq = new NextRequest('http://localhost/api/v1/files', { method: 'POST', body: form });
    uploadReq.cookies.set('omniagent_session', owner.token);
    const uploaded = await postFile(uploadReq);
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();
    const fileId = uploadedBody.file.id;
    assert.equal(uploadedBody.file.indexed, true);

    const ownerSearchReq = new NextRequest('http://localhost/api/v1/knowledge/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'nebula-alpha project codeword' }),
    });
    ownerSearchReq.cookies.set('omniagent_session', owner.token);
    const ownerSearch = await searchKnowledge(ownerSearchReq);
    const ownerHits = await ownerSearch.json();
    assert.equal(ownerSearch.status, 200);
    assert.ok(ownerHits.hits > 0);
    assert.match(ownerHits.context, /nebula-alpha/);

    const otherSearchReq = new NextRequest('http://localhost/api/v1/knowledge/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'nebula-alpha project codeword' }),
    });
    otherSearchReq.cookies.set('omniagent_session', other.token);
    const otherSearch = await searchKnowledge(otherSearchReq);
    const otherHits = await otherSearch.json();
    assert.equal(otherSearch.status, 200);
    assert.equal(otherHits.hits, 0);
    assert.equal(otherHits.context, '');

    const deleteReq = new NextRequest(`http://localhost/api/v1/files/${fileId}`, { method: 'DELETE' });
    deleteReq.cookies.set('omniagent_session', owner.token);
    const deleted = await deleteFile(deleteReq, { params: Promise.resolve({ id: fileId }) });
    assert.equal(deleted.status, 200);

    const afterDeleteReq = new NextRequest('http://localhost/api/v1/knowledge/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'nebula-alpha project codeword' }),
    });
    afterDeleteReq.cookies.set('omniagent_session', owner.token);
    const afterDelete = await searchKnowledge(afterDeleteReq);
    const afterHits = await afterDelete.json();
    assert.equal(afterHits.hits, 0);
  });

  it('revokes conversation shares and blocks sharee writes through chat', async () => {
    const owner = await DatabaseStore.registerUser(`share-revoke-${Date.now()}@example.com`, 'password123', 'Owner');
    const other = await DatabaseStore.registerUser(`share-revoke-other-${Date.now()}@example.com`, 'password123', 'Other');
    const conversation = await DatabaseStore.getOrCreateConversation(
      undefined,
      'proj_default_core',
      'agent_general_assistant',
      'Revocable chat',
      owner.user.id
    );

    const createShareReq = new NextRequest('http://localhost/api/v1/shares', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resourceType: 'conversation', resourceId: conversation.id, email: other.user.email }),
    });
    createShareReq.cookies.set('omniagent_session', owner.token);
    const shared = await postShare(createShareReq);
    assert.equal(shared.status, 201);
    const shareId = (await shared.json()).share.id;

    const otherGet = await getConversation(
      requestWith(`http://localhost/api/v1/conversations/${conversation.id}`, {}, { omniagent_session: other.token }),
      { params: Promise.resolve({ id: conversation.id }) }
    );
    assert.equal(otherGet.status, 200);

    const writeReq = new NextRequest('http://localhost/api/v1/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'sharee should not write', conversationId: conversation.id }),
    });
    writeReq.cookies.set('omniagent_session', other.token);
    const writeRes = await postChat(writeReq);
    assert.equal(writeRes.status, 404);

    const ownerRevoke = new NextRequest(`http://localhost/api/v1/shares/${shareId}`, { method: 'DELETE' });
    ownerRevoke.cookies.set('omniagent_session', owner.token);
    const revoked = await deleteShare(ownerRevoke, { params: Promise.resolve({ id: shareId }) });
    assert.equal(revoked.status, 200);

    const afterRevoke = await getConversation(
      requestWith(`http://localhost/api/v1/conversations/${conversation.id}`, {}, { omniagent_session: other.token }),
      { params: Promise.resolve({ id: conversation.id }) }
    );
    assert.equal(afterRevoke.status, 404);
  });

  it('counts unique users even when a profile row is missing from memory', async () => {
    const first = await DatabaseStore.registerUser(`count-a-${Date.now()}@example.com`, 'password123', 'A');
    const second = await DatabaseStore.registerUser(`count-b-${Date.now()}@example.com`, 'password123', 'B');
    const users = await DatabaseStore.listUsers();
    const ids = users.map((u) => u.id);
    assert.ok(ids.includes(first.user.id));
    assert.ok(ids.includes(second.user.id));
    assert.equal(uniqueUserCount(users), new Set(ids).size);
    const overview = await DatabaseStore.getPlatformOverview();
    assert.equal(overview.totalUsers, uniqueUserCount(users));
  });
});
