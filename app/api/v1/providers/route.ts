import { NextRequest, NextResponse } from 'next/server';
import { DatabaseStore } from '@/lib/db/store';

export async function GET() {
  try {
    const providers = await DatabaseStore.listProviders();
    return NextResponse.json({ success: true, providers });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to list providers' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.protocol) {
      return NextResponse.json(
        { success: false, error: 'Name and protocol are required fields' },
        { status: 400 }
      );
    }

    const provider = await DatabaseStore.createProvider(body);
    return NextResponse.json({ success: true, provider });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to create provider' },
      { status: 500 }
    );
  }
}
