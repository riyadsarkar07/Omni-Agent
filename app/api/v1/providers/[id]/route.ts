import { NextRequest, NextResponse } from 'next/server';
import { DatabaseStore } from '@/lib/db/store';

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

    // Safely strip secret key before sending
    const safeProvider = {
      ...provider,
      hasApiKey: Boolean(provider.apiKey),
      apiKey: undefined,
    };

    return NextResponse.json({ success: true, provider: safeProvider });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updated = await DatabaseStore.updateProvider(id, body);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, provider: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await DatabaseStore.deleteProvider(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Provider deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
