import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/lib/gemini';
import { GenerateVideosOperation } from '@google/genai';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const { errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);

  try {
    const { operationName } = await req.json();

    if (!operationName) {
      return applyCorsHeaders(NextResponse.json({ error: 'operationName is required' }, { status: 400 }));
    }

    const op = new GenerateVideosOperation();
    op.name = operationName;

    const updated = await ai.operations.getVideosOperation({ operation: op });

    if (!updated.done) {
      return applyCorsHeaders(NextResponse.json({
        done: false,
        status: 'processing',
      }));
    }

    // Video is done generating, extract URI and fetch it
    const videoObj = updated.response?.generatedVideos?.[0]?.video;
    const uri = videoObj?.uri;

    if (!uri) {
      return applyCorsHeaders(NextResponse.json({
        done: true,
        error: 'Video generated but no video URI found in response',
      }));
    }

    // Download the video with process.env.GEMINI_API_KEY
    const videoRes = await fetch(uri, {
      headers: {
        'x-goog-api-key': process.env.GEMINI_API_KEY || '',
      },
    });

    if (!videoRes.ok) {
      throw new Error(`Failed to download video from Google: ${videoRes.statusText}`);
    }

    const buffer = await videoRes.arrayBuffer();
    const base64Video = Buffer.from(buffer).toString('base64');

    return applyCorsHeaders(NextResponse.json({
      done: true,
      status: 'completed',
      video: `data:video/mp4;base64,${base64Video}`,
    }));
  } catch (error: any) {
    console.error('Video Status Polling Error:', error);
    return applyCorsHeaders(
      NextResponse.json({ error: error.message || 'An error occurred during video status polling' }, { status: 500 })
    );
  }
}
