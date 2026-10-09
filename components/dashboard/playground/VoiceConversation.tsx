'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, MicOff, Square, Volume2, VolumeX, X } from 'lucide-react';
import { apiFetch } from '@/lib/auth/session-client';
import { useSpeechPlayback } from '@/hooks/useSpeechPlayback';
import { detectSpeechSupport, SpeechSupport } from '@/hooks/useSpeechRecognition';

type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

interface VoiceConversationProps {
  open: boolean;
  onClose: () => void;
  agentId?: string;
  conversationId?: string;
  onConversationId: (id: string) => void;
  overrideModel?: string;
  overrideProviderId?: string;
  thinkingLevel?: 'HIGH' | 'LOW' | 'MINIMAL' | 'OFF';
  onUserUtterance: (text: string) => void;
  onAssistantUtterance: (text: string, meta?: { model?: string; tokens?: number; latencyMs?: number }) => void;
}

async function transcribeRecording(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
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
  return String(data.transcription || '').trim();
}

export const VoiceConversation: React.FC<VoiceConversationProps> = ({
  open,
  onClose,
  agentId,
  conversationId,
  onConversationId,
  overrideModel,
  overrideProviderId,
  thinkingLevel,
  onUserUtterance,
  onAssistantUtterance,
}) => {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const support = detectSpeechSupport();
  const [status, setStatus] = useState('Tap the microphone, speak, then tap again to send.');
  const [error, setError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState('');
  const wantedRef = useRef(false);
  const recRef = useRef<{ stop: () => void; abort?: () => void } | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const collectedRef = useRef('');
  const sendingRef = useRef(false);
  const conversationRef = useRef(conversationId || '');
  const { muted, supported: ttsSupported, speak, stop: stopSpeech, toggleMute } = useSpeechPlayback();

  useEffect(() => {
    conversationRef.current = conversationId || '';
  }, [conversationId]);

  const cleanupMic = useCallback(() => {
    wantedRef.current = false;
    recRef.current?.abort?.();
    recRef.current = null;
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
    mediaRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => cleanupMic(), [cleanupMic]);

  const sendUtterance = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        sendingRef.current = false;
        setPhase('idle');
        setStatus('Nothing was heard. Tap the microphone and try again.');
        return;
      }
      if (sendingRef.current) return;
      sendingRef.current = true;
      setLastHeard(trimmed);
      onUserUtterance(trimmed);
      setPhase('thinking');
      setStatus('Thinking...');
      try {
        const res = await apiFetch('/api/v1/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            agentId,
            conversationId: conversationRef.current || undefined,
            overrideModel,
            overrideProviderId,
            thinkingLevel,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Chat failed');
        if (data.conversationId) {
          conversationRef.current = data.conversationId;
          onConversationId(data.conversationId);
        }
        const reply = String(data.message || '').trim();
        onAssistantUtterance(reply, {
          model: data.model,
          tokens: data.usage?.totalTokens,
          latencyMs: data.usage?.latencyMs,
        });
        if (!reply) {
          setPhase('idle');
          setStatus('No spoken reply was generated. Tap to continue.');
          return;
        }
        if (ttsSupported && !muted) {
          setPhase('speaking');
          setStatus('Speaking...');
          speak(reply, () => {
            setPhase('idle');
            setStatus('Tap the microphone to continue.');
          });
        } else {
          setPhase('idle');
          setStatus(muted || !ttsSupported ? 'Reply ready. Speech playback is muted or unavailable.' : 'Tap to continue.');
        }
      } catch (err) {
        setPhase('error');
        setError((err as Error).message || 'Voice conversation failed');
        setStatus('Something went wrong. You can retry.');
      } finally {
        sendingRef.current = false;
      }
    },
    [agentId, muted, onAssistantUtterance, onConversationId, onUserUtterance, overrideModel, overrideProviderId, speak, thinkingLevel, ttsSupported]
  );

  const finishBrowserTranscript = useCallback(
    (text: string) => {
      cleanupMic();
      void sendUtterance(text);
    },
    [cleanupMic, sendUtterance]
  );

  const startListening = useCallback(async () => {
    setError(null);
    stopSpeech();
    wantedRef.current = true;
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        start: () => void;
        stop: () => void;
        abort: () => void;
        onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
        onerror: ((event: { error?: string }) => void) | null;
        onend: (() => void) | null;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        start: () => void;
        stop: () => void;
        abort: () => void;
        onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
        onerror: ((event: { error?: string }) => void) | null;
        onend: (() => void) | null;
      };
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (Ctor) {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || 'en-US';
      collectedRef.current = '';
      rec.onresult = (event) => {
        let live = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result.isFinal) collectedRef.current += `${result[0].transcript} `;
          else live += result[0].transcript;
        }
        setStatus((collectedRef.current + live).trim() || 'Listening...');
      };
      rec.onerror = (event) => {
        if (event.error === 'not-allowed') {
          setPhase('error');
          setError('Microphone permission was denied.');
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
        finishBrowserTranscript(collectedRef.current.trim());
      };
      recRef.current = rec;
      rec.start();
      setPhase('listening');
      setStatus('Listening... tap again when you are done.');
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
        setPhase('transcribing');
        setStatus('Transcribing...');
        try {
          const text = await transcribeRecording(blob);
          await sendUtterance(text);
        } catch (err) {
          setPhase('error');
          setError((err as Error).message || 'Transcription failed');
        }
      };
      mediaRef.current = recorder;
      recorder.start();
      setPhase('listening');
      setStatus('Listening... tap again when you are done.');
    } catch (err) {
      const name = (err as DOMException).name;
      setPhase('error');
      setError(
        name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'Microphone permission was denied. Enable it in the browser and try again.'
          : (err as Error).message || 'Could not start microphone.'
      );
    }
  },     [finishBrowserTranscript, sendUtterance, stopSpeech]);

  const stopListening = useCallback(() => {
    wantedRef.current = false;
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
      return;
    }
    if (mediaRef.current && mediaRef.current.state !== 'inactive') {
      mediaRef.current.stop();
    }
  }, []);

  const handlePrimary = () => {
    if (phase === 'listening') {
      stopListening();
      return;
    }
    if (phase === 'speaking') {
      stopSpeech();
      setPhase('idle');
      setStatus('Tap the microphone to continue.');
      return;
    }
    if (phase === 'thinking' || phase === 'transcribing') return;
    void startListening();
  };

  const handleClose = () => {
    cleanupMic();
    stopSpeech();
    onClose();
  };

  if (!open) return null;

  const label =
    phase === 'listening'
      ? 'Listening'
      : phase === 'transcribing'
        ? 'Transcribing'
        : phase === 'thinking'
          ? 'Thinking'
          : phase === 'speaking'
            ? 'Speaking'
            : phase === 'error'
              ? 'Error'
              : 'Ready';

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-zinc-950/95 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-zinc-100">Voice Conversation</div>
          <div className="text-[11px] text-zinc-500">Push to talk, then hear the reply aloud.</div>
        </div>
        <button
          type="button"
          aria-label="End voice conversation"
          onClick={handleClose}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <div
          className={`flex h-28 w-28 items-center justify-center rounded-full border ${
            phase === 'listening'
              ? 'border-cyan-400/50 bg-cyan-400/10 shadow-[0_0_40px_rgba(34,211,238,0.2)]'
              : phase === 'speaking'
                ? 'border-emerald-400/40 bg-emerald-400/10'
                : 'border-white/10 bg-white/5'
          }`}
        >
          {phase === 'speaking' ? <Volume2 className="h-8 w-8 text-emerald-200" /> : <AudioLines className="h-8 w-8 text-cyan-200" />}
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
        <p className="max-w-sm text-sm leading-relaxed text-zinc-200">{status}</p>
        {lastHeard ? <p className="max-w-sm text-[12px] text-zinc-500">You: {lastHeard}</p> : null}
        {error ? <p className="max-w-sm text-[12px] text-amber-300">{error}</p> : null}
        {support === 'none' ? (
          <p className="max-w-sm text-[12px] text-amber-300">
            This browser does not support microphone capture or speech recognition.
          </p>
        ) : null}
        {!ttsSupported ? (
          <p className="max-w-sm text-[12px] text-zinc-500">
            Text-to-speech is unavailable here. Replies still appear in the chat transcript.
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-center gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-label={muted ? 'Unmute replies' : 'Mute replies'}
          onClick={toggleMute}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 text-zinc-300"
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button
          type="button"
          aria-label={phase === 'listening' ? 'Stop listening' : 'Start listening'}
          disabled={support === 'none' || phase === 'thinking' || phase === 'transcribing'}
          onClick={handlePrimary}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-cyan-400 text-zinc-950 disabled:opacity-40"
        >
          {phase === 'listening' ? <Square className="h-5 w-5 fill-current" /> : phase === 'speaking' ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>
        <button
          type="button"
          aria-label="End session"
          onClick={handleClose}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
