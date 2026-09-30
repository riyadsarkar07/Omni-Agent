import { NextRequest, NextResponse } from 'next/server';
import { DatabaseStore } from '@/lib/db/store';
import { ModelRouter } from '@/lib/providers/router';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const provider = await DatabaseStore.getProvider(id);
    if (!provider) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 });
    }

    // Call adapter listModels
    const models = await ModelRouter.listModels(provider);

    // Save discovered models to provider definition if they differ or are non-empty
    if (models && models.length > 0) {
      await DatabaseStore.updateProvider(id, { models });
    }

    return NextResponse.json({
      success: true,
      models,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
