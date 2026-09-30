import { NextRequest, NextResponse } from 'next/server';
import { DatabaseStore } from '@/lib/db/store';
import { ModelRouter } from '@/lib/providers/router';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const provider = await DatabaseStore.getProvider(id);
    if (!provider) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 });
    }

    const startTime = Date.now();
    const result = await ModelRouter.testConnection(provider);
    const latencyMs = Date.now() - startTime;

    // Update connection status in storage
    const updatedStatus = result.success ? 'Connected' : result.status;
    await DatabaseStore.updateProvider(id, {
      connectionStatus: updatedStatus as any,
      lastTested: new Date().toISOString(),
      latencyMs: result.success ? latencyMs : null,
    });

    return NextResponse.json({
      success: result.success,
      status: updatedStatus,
      latencyMs: result.success ? latencyMs : null,
      error: result.error || null,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
