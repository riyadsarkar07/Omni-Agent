'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

export function useSpeechPlayback() {
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const supported = canSpeak();
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!text.trim() || muted || !canSpeak()) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.onend = () => {
        setSpeaking(false);
        utteranceRef.current = null;
        onEnd?.();
      };
      utterance.onerror = () => {
        setSpeaking(false);
        utteranceRef.current = null;
        onEnd?.();
      };
      utteranceRef.current = utterance;
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [muted]
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next && typeof window !== 'undefined') window.speechSynthesis?.cancel();
      if (next) setSpeaking(false);
      return next;
    });
  }, []);

  return { speaking, muted, supported, speak, stop, toggleMute, setMuted };
}
