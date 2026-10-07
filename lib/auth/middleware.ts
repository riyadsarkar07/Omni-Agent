import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { DatabaseStore, DEMO_PRESET_KEY } from '../db/store';
import { hashApiKey, checkRateLimit } from './api-key';
import { Project, ApiKey, User } from '../types';
import { getAdminEmail, getAdminSecret, isProduction } from '../config';
import { isUserActive } from './rbac';
import { applyCorsHeaders as applyOriginCors } from './cors';

export interface AuthContext {
  project: Project;
  apiKey?: ApiKey;
  isAdmin: boolean;
  user?: User;
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

export function verifyEmergencyAdminSecret(providedSecret: string | null | undefined): boolean {
  const adminSecret = getAdminSecret();
  if (!adminSecret || !providedSecret) {
    return false;
  }
  return timingSafeEqualString(providedSecret, adminSecret);
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

  const cookieToken = req.cookies.get('omniagent_session')?.value;
  const looksLikeApiKey = Boolean(providedToken && /^(ua_live_|ua_test_)/.test(providedToken));
  const configuredAdminEmail = getAdminEmail();

  let sessionUser = cookieToken ? await DatabaseStore.verifySessionToken(cookieToken) : null;
  if (!sessionUser && providedToken && !looksLikeApiKey) {
    sessionUser = await DatabaseStore.verifySessionToken(providedToken);
  }

  if (sessionUser) {
    if (!isUserActive(sessionUser)) {
      return {
        errorResponse: NextResponse.json(
          {
            error: 'Forbidden: Account Disabled',
            message: 'This account has been disabled. Contact an administrator.',
          },
          { status: 403 }
        ),
      };
    }
    const isConfiguredAdmin =
      Boolean(configuredAdminEmail) && sessionUser.email.toLowerCase() === configuredAdminEmail!.toLowerCase();
    const isAdmin = sessionUser.role === 'admin' || isConfiguredAdmin;
    const sessionRate = checkRateLimit(`session:${sessionUser.id}`, isAdmin ? 300 : 60);
    if (!sessionRate.allowed) {
      return {
        errorResponse: NextResponse.json(
          {
            error: 'Too Many Requests',
            message: 'Session rate limit exceeded.',
            retryAfterSeconds: sessionRate.resetSeconds,
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': isAdmin ? '300' : '60',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(sessionRate.resetSeconds),
              'Retry-After': String(sessionRate.resetSeconds),
            },
          }
        ),
      };
    }
    let project = isAdmin
      ? (await DatabaseStore.listProjects())[0]
      : await DatabaseStore.getUserPrimaryProject(sessionUser.id);
    if (!project) {
      project = (await DatabaseStore.listProjects())[0] || {
        id: 'proj_default_core',
        name: 'Universal Core Platform',
        slug: 'core-platform',
        description: '',
        rate_limit_rpm: 60,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    DatabaseStore.touchUserActivity(sessionUser.id).catch(() => {});
    return {
      auth: {
        project,
        isAdmin,
        user: sessionUser,
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

  let keyHash: string;
  try {
    keyHash = hashApiKey(providedToken);
  } catch {
    return {
      errorResponse: NextResponse.json(
        {
          error: 'Service Unavailable',
          message: 'API key authentication is not configured for production.',
        },
        { status: 503 }
      ),
    };
  }
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

export function applyCorsHeaders(response: NextResponse, req?: NextRequest): NextResponse {
  return applyOriginCors(response, req);
}
