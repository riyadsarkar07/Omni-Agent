import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/lib/gemini';
import { authenticateApiRequest, applyCorsHeaders } from '@/lib/auth/middleware';

export async function OPTIONS() {
  return applyCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest) {
  const { errorResponse } = await authenticateApiRequest(req);
  if (errorResponse) return applyCorsHeaders(errorResponse);

  try {
    const { prompt, model } = await req.json();

    if (!prompt) {
      return applyCorsHeaders(NextResponse.json({ error: 'Prompt is required' }, { status: 400 }));
    }

    const modelToUse = model === 'pro' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';

    // Call generateContentStream to generate music
    const responseStream = await ai.models.generateContentStream({
      model: modelToUse,
      contents: prompt,
    });

    let audioBase64 = '';
    let lyrics = '';
    let mimeType = 'audio/wav';

    for await (const chunk of responseStream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;
      for (const part of parts) {
        if (part.inlineData?.data) {
          if (!audioBase64 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioBase64 += part.inlineData.data;
        }
        if (part.text && !lyrics) {
          lyrics = part.text;
        }
      }
    }

    if (!audioBase64) {
      return applyCorsHeaders(NextResponse.json({ error: 'Failed to generate audio content' }, { status: 500 }));
    }

    return applyCorsHeaders(NextResponse.json({
      success: true,
      audio: `data:${mimeType};base64,${audioBase64}`,
      lyrics: lyrics || null,
      model: modelToUse,
    }));
  } catch (error: any) {
    console.error('Music Generation Error:', error);
    return applyCorsHeaders(
      NextResponse.json({ error: error.message || 'An error occurred during music generation' }, { status: 500 })
    );
  }
}
