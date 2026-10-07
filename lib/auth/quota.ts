import { NextResponse } from 'next/server';
import { DatabaseStore } from '../db/store';
import { User } from '../types';
import { applyCorsHeaders } from './cors';
import { NextRequest } from 'next/server';

export async function enforceUserQuota(
  user: User | undefined,
  req?: NextRequest
): Promise<NextResponse | null> {
  if (!user) return null;
  const quota = user.preferences?.monthly_request_quota ?? 500;
  if (!quota || quota <= 0) return null;
  const used = await DatabaseStore.countUserUsageThisMonth(user.id);
  if (used >= quota) {
    return applyCorsHeaders(
      NextResponse.json(
        {
          error: 'Quota Exceeded',
          message: `Monthly request quota of ${quota} has been reached.`,
        },
        { status: 429 }
      ),
      req
    );
  }
  return null;
}
