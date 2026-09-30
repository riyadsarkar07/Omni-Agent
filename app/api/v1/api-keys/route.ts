import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';
import { generateApiKey } from '@/lib/auth/api-key';
import { DatabaseStore } from '@/lib/db/store';

const createKeySchema = z.object({
  name: z.string().min(2, 'Key name must be at least 2 characters').max(60),
  environment: z.enum(['production', 'development']).default('production'),
  rate_limit_rpm: z.number().int().min(5).max(1000).default(60),
  project_id: z.string().optional(),
});

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  const projectId = req.nextUrl.searchParams.get('projectId') || (auth.isAdmin ? undefined : auth.project.id);
  const keys = await DatabaseStore.listApiKeys(projectId);

  // Note: key_hash is stripped for security; rawKey is never returned
  const sanitized = keys.map((k) => ({
    id: k.id,
    projectId: k.project_id,
    name: k.name,
    keyPrefix: k.key_prefix,
    environment: k.environment,
    rateLimitRpm: k.rate_limit_rpm,
    status: k.status,
    lastUsedAt: k.last_used_at,
    expiresAt: k.expires_at,
    createdAt: k.created_at,
  }));

  return applyCorsHeaders(NextResponse.json({ apiKeys: sanitized }));
}

export async function POST(req: NextRequest) {
  const { auth, errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);
  if (!auth) return applyCorsHeaders(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

  try {
    const rawBody = await req.json();
    const parseResult = createKeySchema.safeParse(rawBody);

    if (!parseResult.success) {
      return applyCorsHeaders(
        NextResponse.json({ error: 'Validation Error', details: parseResult.error.flatten().fieldErrors }, { status: 400 })
      );
    }

    const { name, environment, rate_limit_rpm, project_id } = parseResult.data;
    const targetProjectId = project_id || auth.project.id;

    // Generate cryptographically random key
    const generated = generateApiKey(environment);

    // Save only the hash
    const savedKey = await DatabaseStore.createApiKey({
      project_id: targetProjectId,
      name,
      key_prefix: generated.keyPrefix,
      key_hash: generated.keyHash,
      environment,
      rate_limit_rpm,
      last_used_at: null,
      expires_at: null,
      status: 'active',
    });

    await DatabaseStore.logAudit({
      project_id: targetProjectId,
      user_email: 'admin@omniagent.io',
      action: 'API_KEY_CREATED',
      resource_type: 'api_key',
      resource_id: savedKey.id,
      details: { name, keyPrefix: generated.keyPrefix, environment },
    });

    // REVEAL RAW KEY ONLY ONCE UPON CREATION
    return applyCorsHeaders(
      NextResponse.json(
        {
          message: 'API Key generated successfully. Copy and store it securely; you will NOT be able to see it again.',
          apiKey: {
            id: savedKey.id,
            name: savedKey.name,
            keyPrefix: savedKey.key_prefix,
            environment: savedKey.environment,
            rateLimitRpm: savedKey.rate_limit_rpm,
            status: savedKey.status,
            createdAt: savedKey.created_at,
          },
          rawKey: generated.rawKey,
        },
        { status: 201 }
      )
    );
  } catch (err: unknown) {
    return applyCorsHeaders(
      NextResponse.json({ error: 'Failed to generate API Key', message: (err as Error).message }, { status: 500 })
    );
  }
}
