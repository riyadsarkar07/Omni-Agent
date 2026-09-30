import { NextRequest, NextResponse } from 'next/server';
import { DatabaseStore, DEMO_PRESET_KEY } from '../db/store';
import { hashApiKey, checkRateLimit } from './api-key';
import { Project, ApiKey } from '../types';
import { getAdminEmail, getAdminSecret, isProduction } from '../config';

export interface AuthContext {
  project: Project;
  apiKey?: ApiKey;
  isAdmin: boolean;
}

export async function authenticateApiRequest(
  req: NextRequest
): Promise<{ auth?: AuthContext; errorResponse?: NextResponse }> {
  // 1. Extract token from Authorization header or x-api-key
  let providedToken: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    providedToken = authHeader.slice(7).trim();
  } else {
    providedToken = req.headers.get('x-api-key');
  }

  // 2. Check if request is authenticated via session cookie or admin secret
  const sessionToken = req.cookies.get('omniagent_session')?.value;
  const adminSecret = getAdminSecret();
  const providedAdminSecret = req.headers.get('x-admin-secret');
  const configuredAdminEmail = getAdminEmail();

  let sessionUser = sessionToken ? await DatabaseStore.verifySessionToken(sessionToken) : null;
  const defaultProject = (await DatabaseStore.listProjects())[0];

  if (sessionUser && defaultProject) {
    const isConfiguredAdmin =
      Boolean(configuredAdminEmail) && sessionUser.email.toLowerCase() === configuredAdminEmail!.toLowerCase();
    return {
      auth: {
        project: defaultProject,
        isAdmin: sessionUser.role === 'admin' || isConfiguredAdmin,
      },
    };
  }

  if (adminSecret && providedAdminSecret && providedAdminSecret === adminSecret && defaultProject) {
    return {
      auth: {
        project: defaultProject,
        isAdmin: true,
      },
    };
  }

  // If no token provided, return 401
  if (!providedToken) {
    return {
      errorResponse: NextResponse.json(
        {
          error: 'Unauthorized: Missing API Key',
          message: 'Provide an API key via "Authorization: Bearer <your-api-key>" or "x-api-key" header.',
          docsUrl: '/api/v1/health',
        },
        { status: 401 }
      ),
    };
  }

  // 3. Hash key and verify in database
  const keyHash = hashApiKey(providedToken);
  let apiKey = await DatabaseStore.getApiKeyByHash(keyHash);

  if (!apiKey && !isProduction() && providedToken === DEMO_PRESET_KEY) {
    const keys = await DatabaseStore.listApiKeys();
    apiKey = keys.find((k) => k.id === 'key_demo_default') || null;
  }

  if (!apiKey) {
    return {
      errorResponse: NextResponse.json(
        {
          error: 'Unauthorized: Invalid API Key',
          message: 'The provided API key does not exist or has been revoked.',
        },
        { status: 401 }
      ),
    };
  }

  if (apiKey.status !== 'active') {
    return {
      errorResponse: NextResponse.json(
        {
          error: 'Forbidden: API Key Revoked',
          message: 'This API key has been revoked and can no longer be used.',
        },
        { status: 403 }
      ),
    };
  }

  // Check project
  const project = await DatabaseStore.getProject(apiKey.project_id);
  if (!project || !project.is_active) {
    return {
      errorResponse: NextResponse.json(
        {
          error: 'Forbidden: Project Inactive',
          message: 'The project associated with this API key is inactive or deleted.',
        },
        { status: 403 }
      ),
    };
  }

  // 4. Rate Limiting Check
  const rateLimit = checkRateLimit(apiKey.id, apiKey.rate_limit_rpm || project.rate_limit_rpm || 60);
  if (!rateLimit.allowed) {
    return {
      errorResponse: NextResponse.json(
        {
          error: 'Too Many Requests',
          message: `Rate limit of ${apiKey.rate_limit_rpm} requests per minute exceeded.`,
          retryAfterSeconds: rateLimit.resetSeconds,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(apiKey.rate_limit_rpm),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimit.resetSeconds),
            'Retry-After': String(rateLimit.resetSeconds),
          },
        }
      ),
    };
  }

  // Record usage timestamp asynchronously
  DatabaseStore.recordApiKeyUsage(apiKey.id).catch(() => {});

  return {
    auth: {
      project,
      apiKey,
      isAdmin: false,
    },
  };
}

export function applyCorsHeaders(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-internal-admin');
  return response;
}
