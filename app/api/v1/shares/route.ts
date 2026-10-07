import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { DatabaseStore } from '@/lib/db/store';
import { canManageAgent, isConversationOwner, requireSessionUser } from '@/lib/auth/rbac';

const createSchema = z.object({
  resourceType: z.enum(['conversation', 'agent']),
  resourceId: z.string().min(1).max(80),
  email: z.string().email(),
});

function publicShare(share: {
  id: string;
  resource_type: string;
  resource_id: string;
  owner_id: string;
  shared_with_user_id: string;
  shared_with_email?: string;
  permission: string;
  created_at: string;
}) {
  return {
    id: share.id,
    resourceType: share.resource_type,
    resourceId: share.resource_id,
    ownerId: share.owner_id,
    sharedWithUserId: share.shared_with_user_id,
    sharedWithEmail: share.shared_with_email || null,
    permission: share.permission,
    createdAt: share.created_at,
  };
}

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  const resourceType = req.nextUrl.searchParams.get('resourceType');
  const resourceId = req.nextUrl.searchParams.get('resourceId') || undefined;
  const type = resourceType === 'conversation' || resourceType === 'agent' ? resourceType : undefined;
  const shares = await DatabaseStore.listSharesForOwner(auth!.user!.id, type, resourceId);
  return applyCorsHeaders(NextResponse.json({ shares: shares.map(publicShare), total: shares.length }));
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  const denied = requireSessionUser(auth);
  if (denied) return denied;
  if (!auth?.user) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  try {
    const parse = createSchema.safeParse(await req.json());
    if (!parse.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parse.error.flatten().fieldErrors }, { status: 400 })
      );
    }

    const email = parse.data.email.trim().toLowerCase();
    if (email === auth.user.email.toLowerCase()) {
      return applyCorsHeaders(NextResponse.json({ error: 'You cannot share a resource with yourself' }, { status: 400 }));
    }

    const target = await DatabaseStore.getUserByEmail(email);
    if (!target) {
      return applyCorsHeaders(NextResponse.json({ error: 'User not found' }, { status: 404 }));
    }

    if (parse.data.resourceType === 'conversation') {
      const existing = await DatabaseStore.getConversation(parse.data.resourceId);
      if (!existing || !isConversationOwner(auth, existing.conversation)) {
        return applyCorsHeaders(NextResponse.json({ error: 'Conversation not found' }, { status: 404 }));
      }
    } else {
      const agent = await DatabaseStore.getAgent(parse.data.resourceId);
      if (!agent || !canManageAgent(auth, agent)) {
        return applyCorsHeaders(NextResponse.json({ error: 'Agent not found' }, { status: 404 }));
      }
    }

    const share = await DatabaseStore.createShare({
      resource_type: parse.data.resourceType,
      resource_id: parse.data.resourceId,
      owner_id: auth.user.id,
      shared_with_user_id: target.id,
      shared_with_email: target.email,
      permission: 'read',
    });

    return applyCorsHeaders(NextResponse.json({ share: publicShare(share) }, { status: 201 }));
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to create share', message: (err as Error).message }, { status: 500 })
    );
  }
}
