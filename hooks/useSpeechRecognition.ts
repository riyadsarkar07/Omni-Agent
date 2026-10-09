'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/auth/session-client';

export type SpeechSupport = 'browser' | 'server' | 'none';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

function getBrowserRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function detectSpeechSupport(): SpeechSupport {
  if (typeof window === 'undefined') return 'none';
  if (getBrowserRecognition()) return 'browser';
  if (typeof navigator.mediaDevices?.getUserMedia === 'function') return 'server';
  return 'none';
}

export function useSpeechRecognition(onTranscript: (text: string, final: boolean) => void) {
  const support = detectSpeechSupport();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const wantedRef = useRef(false);

  useEffect(() => {
    return () => {
      wantedRef.current = false;
      recRef.current?.abort();
      mediaRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const stop = useCallback(() => {
    wantedRef.current = false;
    recRef.current?.stop();
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setListening(false);
  }, []);

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read recorded audio'));
        reader.readAsDataURL(blob);
      });
      const res = await apiFetch('/api/creative/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: dataUrl, mimeType: blob.type || 'audio/webm' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Transcription failed');
      const text = String(data.transcription || '').trim();
      if (text) onTranscript(text, true);
    },
    [onTranscript]
  );

  const startServerCapture = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot access the microphone.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        chunksRef.current = [];
        if (blob.size < 64) return;
        try {
          await transcribeBlob(blob);
        } catch (err) {
          setError((err as Error).message || 'Server transcription failed');
        }
      };
      mediaRef.current = recorder;
      recorder.start();
      setListening(true);
      setError(null);
    } catch (err) {
      const name = (err as DOMException).name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('Microphone permission was denied. Enable it in the browser and try again.');
      } else {
        setError((err as Error).message || 'Could not start microphone.');
      }
      setListening(false);
    }
  }, [transcribeBlob]);

  const start = useCallback(async () => {
    setError(null);
    wantedRef.current = true;
    const Ctor = getBrowserRecognition();
    if (Ctor) {
      try {
        const rec = new Ctor();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';
        rec.onresult = (event) => {
          let interim = '';
          let finalText = '';
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            if (result.isFinal) finalText += result[0].transcript;
            else interim += result[0].transcript;
          }
          if (finalText) onTranscript(finalText, true);
          else if (interim) onTranscript(interim, false);
        };
        rec.onerror = (event) => {
          const code = event.error || '';
          if (code === 'not-allowed') {
            setError('Microphone permission was denied. Enable it in the browser and try again.');
          } else if (code === 'no-speech') {
            setError('No speech detected. Try again.');
          } else if (code && code !== 'aborted') {
            setError(`Speech recognition error: ${code}`);
          }
        };
        rec.onend = () => {
          if (wantedRef.current) {
            try {
              rec.start();
              return;
            } catch {
              //
            }
          }
          setListening(false);
        };
        recRef.current = rec;
        rec.start();
        setListening(true);
        return;
      } catch (err) {
        setError((err as Error).message || 'Browser speech recognition failed.');
      }
    }
    await startServerCapture();
  }, [onTranscript, startServerCapture]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else void start();
  }, [listening, start, stop]);

  return { support, listening, error, setError, start, stop, toggle };
}
