import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const { prompt, image, aspectRatio } = await req.json();

    let imageObj = undefined;
    if (image) {
      // Parse base64 image data-url if passed
      const match = image.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
      if (match) {
        imageObj = {
          imageBytes: match[2],
          mimeType: match[1],
        };
      } else {
        imageObj = {
          imageBytes: image,
          mimeType: 'image/png',
        };
      }
    }

    const operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt || 'Animate this image',
      image: imageObj,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: aspectRatio || '16:9',
      },
    });

    return NextResponse.json({
      success: true,
      operationName: operation.name,
      model: 'veo-3.1-fast-generate-preview',
    });
  } catch (error: any) {
    console.error('Video Generation Init Error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred while initiating video generation' }, { status: 500 });
  }
}
