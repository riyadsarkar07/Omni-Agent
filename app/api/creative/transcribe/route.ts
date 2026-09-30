import { NextRequest, NextResponse } from 'next/server';
import { ai } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  try {
    const { audio, mimeType } = await req.json();

    if (!audio) {
      return NextResponse.json({ error: 'Audio data is required' }, { status: 400 });
    }

    // Clean up base64 prefix if present
    let cleanAudio = audio;
    let cleanMimeType = mimeType || 'audio/webm';

    const match = audio.match(/^data:(audio\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match) {
      cleanMimeType = match[1];
      cleanAudio = match[2];
    }

    const audioPart = {
      inlineData: {
        mimeType: cleanMimeType,
        data: cleanAudio,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: [audioPart, 'Transcribe this audio carefully.'],
    });

    return NextResponse.json({
      success: true,
      transcription: response.text || 'No transcription text returned.',
      model: 'gemini-3.5-transcribe',
    });
  } catch (error: any) {
    console.error('Audio Transcription Error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred during audio transcription' }, { status: 500 });
  }
}
