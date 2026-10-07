'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Agent, Project } from '@/lib/types';
import { apiFetch } from '@/lib/auth/session-client';
import {
  Bot,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Music,
  Video,
  Mic,
  Volume2,
  FileAudio,
  Film,
  Sparkle,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { ChatWorkspace } from './playground/ChatWorkspace';

interface PlaygroundViewProps {
  agents: Agent[];
  activeProject: Project | null;
  onRefreshAgents: () => void;
  initialConversationId?: string;
  initialAgentId?: string;
}

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({ agents, activeProject, initialConversationId, initialAgentId }) => {
  const [activeSubTab, setActiveSubTab] = useState<'chatbot' | 'music' | 'video' | 'transcribe'>('chatbot');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [musicPrompt, setMusicPrompt] = useState<string>(
    'A lush cinematic synthwave track with analog synthesizers, futuristic pulse, and retro basslines'
  );
  const [musicType, setMusicType] = useState<'clip' | 'pro'>('clip');
  const [isMusicLoading, setIsMusicLoading] = useState<boolean>(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [musicResult, setMusicResult] = useState<{ audio: string; lyrics: string | null; model: string } | null>(null);

  const handleGenerateMusic = async () => {
    setIsMusicLoading(true);
    setMusicError(null);
    setMusicResult(null);

    try {
      const res = await apiFetch('/api/creative/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: musicPrompt, model: musicType }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate music');
      }

      setMusicResult({
        audio: data.audio,
        lyrics: data.lyrics,
        model: data.model,
      });
    } catch (err: unknown) {
      setMusicError((err as Error).message || 'An error occurred while generating music');
    } finally {
      setIsMusicLoading(false);
    }
  };

  const [videoPrompt, setVideoPrompt] = useState<string>(
    'A photorealistic cyberpunk drone flying through neon-lit futuristic skyscraper alleys, rainy reflections, high speed'
  );
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [isVideoLoading, setIsVideoLoading] = useState<boolean>(false);
  const [videoStatusText, setVideoStatusText] = useState<string>('');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoResultUrl, setVideoResultUrl] = useState<string | null>(null);
  const statusPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedImagePreview(URL.createObjectURL(file));
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = () => {
        setUploadedImageBase64(reader.result as string);
      };
    }
  };

  const pollVideoStatus = (operationName: string) => {
    if (statusPollingRef.current) clearInterval(statusPollingRef.current);

    const pollingTexts = [
      'Structuring temporal consistency...',
      'Denoising motion vector fields...',
      'Synthesizing procedural lighting parameters...',
      'Assembling high-fidelity video stream container...',
    ];
    let pollingIdx = 0;

    statusPollingRef.current = setInterval(async () => {
      try {
        const res = await apiFetch('/api/creative/video/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Error polling video status');
        }

        if (data.done) {
          if (statusPollingRef.current) clearInterval(statusPollingRef.current);
          if (data.error) {
            throw new Error(data.error);
          }
          setVideoResultUrl(data.video);
          setIsVideoLoading(false);
          setVideoStatusText('');
        } else {
          setVideoStatusText(pollingTexts[pollingIdx % pollingTexts.length]);
          pollingIdx++;
        }
      } catch (err: unknown) {
        if (statusPollingRef.current) clearInterval(statusPollingRef.current);
        setVideoError((err as Error).message || 'Error occurred while checking video compilation status');
        setIsVideoLoading(false);
      }
    }, 8000);
  };

  const handleGenerateVideo = async () => {
    setIsVideoLoading(true);
    setVideoError(null);
    setVideoResultUrl(null);
    setVideoStatusText('Initializing Veo 3 Video Engine...');

    try {
      const res = await apiFetch('/api/creative/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: videoPrompt,
          image: uploadedImageBase64 || undefined,
          aspectRatio,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize video generation');
      }

      setVideoStatusText('Rendering video frames (this may take up to 2-3 minutes)...');
      pollVideoStatus(data.operationName);
    } catch (err: unknown) {
      setVideoError((err as Error).message || 'An error occurred while launching video generation');
      setIsVideoLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (statusPollingRef.current) clearInterval(statusPollingRef.current);
    };
  }, []);

  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcriptionResult, setTranscriptionResult] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    setTranscribeError(null);
    setTranscriptionResult(null);
    setRecordedAudioUrl(null);
    setRecordedAudioBase64(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          setRecordedAudioBase64(reader.result as string);
        };

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setTranscribeError('Could not access microphone. Ensure recording permissions are granted.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleTranscribe = async () => {
    if (!recordedAudioBase64) return;
    setIsTranscribing(true);
    setTranscribeError(null);

    try {
      const res = await apiFetch('/api/creative/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: recordedAudioBase64,
          mimeType: 'audio/webm',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to transcribe audio');
      }

      setTranscriptionResult(data.transcription);
    } catch (err: unknown) {
      setTranscribeError((err as Error).message || 'An error occurred during transcription');
    } finally {
      setIsTranscribing(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const tabBtn = (id: typeof activeSubTab, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setActiveSubTab(id)}
      className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:px-4 ${
        activeSubTab === id
          ? 'border border-white/5 bg-zinc-800 text-zinc-100'
          : 'text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none border-white/5 shadow-xl glass-panel sm:rounded-2xl sm:border">
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/5 bg-zinc-950/40 p-1 select-none">
          {tabBtn('chatbot', 'AI Chatbot Presets', <Bot className="h-4 w-4" />)}
          {tabBtn('music', 'Music Lab', <Music className="h-4 w-4" />)}
          {tabBtn('video', 'Video Lab', <Video className="h-4 w-4" />)}
          {tabBtn('transcribe', 'Audio Transcriber', <Mic className="h-4 w-4" />)}
        </div>

        {activeSubTab === 'chatbot' && (
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <ChatWorkspace agents={agents} activeProject={activeProject} initialConversationId={initialConversationId} initialAgentId={initialAgentId} />
          </div>
        )}

        {activeSubTab === 'music' && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8 space-y-6">
              <div className="flex items-center gap-3.5 border-b border-slate-800 pb-4">
                <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                  <Music className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-extrabold tracking-tight text-zinc-100 sm:text-2xl">Lyria Creative Audio Engine</h2>
                  <p className="text-xs text-slate-400">Generate high-fidelity audio clips from text descriptors.</p>
                </div>
              </div>

              <div className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Music Generation Prompt</label>
                  <textarea
                    rows={3}
                    value={musicPrompt}
                    onChange={(e) => setMusicPrompt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                    placeholder="Describe your desired soundtrack in detail..."
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Soundtrack Architecture</label>
                    <select
                      value={musicType}
                      onChange={(e) => setMusicType(e.target.value as 'clip' | 'pro')}
                      className="w-full min-h-11 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="clip">Lyria Clip (Up to 30s Promo, Fast)</option>
                      <option value="pro">Lyria Pro (Full-Length HQ Production Track)</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={handleGenerateMusic}
                      disabled={isMusicLoading || !musicPrompt.trim()}
                      className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 transition-all cursor-pointer disabled:opacity-40"
                    >
                      {isMusicLoading ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Generating Audio Stream...
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          Synthesize Audio
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {musicError && (
                <div className="p-3.5 max-w-xl rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{musicError}</span>
                </div>
              )}

              {musicResult && (
                <div className="max-w-xl border border-slate-800 bg-slate-950/40 rounded-xl p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                    <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Sound Synthesized Successfully
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">Model: {musicResult.model}</span>
                  </div>

                  <div className="p-3 bg-slate-900/60 rounded-xl flex items-center gap-4">
                    <div className="p-2.5 bg-cyan-500/10 rounded-lg text-cyan-400">
                      <FileAudio className="w-5 h-5" />
                    </div>
                    <audio src={musicResult.audio} controls className="flex-1 h-9 min-w-0 accent-cyan-500" />
                  </div>

                  {musicResult.lyrics && (
                    <div className="space-y-1 bg-slate-900/20 border border-slate-800/60 p-3.5 rounded-lg">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Lyria Lyrics Transcription</span>
                      <p className="text-xs text-slate-300 italic whitespace-pre-wrap">{musicResult.lyrics}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <CreativeStudioAside />
          </div>
        )}

        {activeSubTab === 'video' && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8 space-y-6">
              <div className="flex items-center gap-3.5 border-b border-slate-800 pb-4">
                <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                  <Video className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-extrabold tracking-tight text-zinc-100 sm:text-2xl">Veo 3 Video Motion Engine</h2>
                  <p className="text-xs text-slate-400">Animate static reference images or synthesize clips from text commands.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                <div className="space-y-4 min-w-0">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">Veo Aspect Ratio</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAspectRatio('16:9')}
                        className={`flex-1 min-h-11 py-2 px-3 text-xs rounded-xl font-medium border transition-all cursor-pointer ${
                          aspectRatio === '16:9'
                            ? 'bg-slate-800 border-cyan-500/30 text-cyan-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Landscape (16:9)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAspectRatio('9:16')}
                        className={`flex-1 min-h-11 py-2 px-3 text-xs rounded-xl font-medium border transition-all cursor-pointer ${
                          aspectRatio === '9:16'
                            ? 'bg-slate-800 border-cyan-500/30 text-cyan-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Portrait (9:16)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">Motion Prompt</label>
                    <textarea
                      rows={3}
                      value={videoPrompt}
                      onChange={(e) => setVideoPrompt(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      placeholder="e.g. camera moves laterally with extreme velocity..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-300">Animate Photo (Optional starting frame)</label>
                    <div className="flex gap-3 items-center">
                      <label className="cursor-pointer flex items-center gap-2 min-h-11 py-2 px-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 transition-all shrink-0">
                        <Upload className="w-4 h-4 text-slate-400" />
                        Upload Photo
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                      </label>
                      {uploadedImagePreview && (
                        <div className="relative w-12 h-12 rounded-lg border border-slate-800 overflow-hidden shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={uploadedImagePreview} alt="starting frame" className="object-cover w-full h-full" />
                          <button
                            type="button"
                            onClick={() => {
                              setUploadedImagePreview(null);
                              setUploadedImageBase64(null);
                            }}
                            className="absolute inset-0 bg-slate-950/60 text-rose-400 font-bold flex items-center justify-center text-[10px] opacity-0 hover:opacity-100 transition-all cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateVideo}
                    disabled={isVideoLoading}
                    className="w-full min-h-11 py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 transition-all cursor-pointer disabled:opacity-40"
                  >
                    {isVideoLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Synthesizing Motion...
                      </>
                    ) : (
                      <>
                        <Film className="w-3.5 h-3.5" />
                        Animate via Veo 3
                      </>
                    )}
                  </button>
                </div>

                <div className="flex flex-col justify-center min-h-[300px] border border-slate-800 bg-slate-950/30 rounded-xl p-5 text-center relative overflow-hidden shadow-xl">
                  {isVideoLoading ? (
                    <div className="space-y-3.5 flex flex-col items-center">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                        <Sparkle className="w-5 h-5 text-cyan-400 absolute inset-0 m-auto animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-indigo-300">Generating video simulation</span>
                        <p className="text-[11px] text-slate-400 max-w-xs">{videoStatusText}</p>
                      </div>
                    </div>
                  ) : videoResultUrl ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                        <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" /> Motion Output Rendered
                        </span>
                      </div>
                      <div
                        className={`mx-auto rounded-lg overflow-hidden border border-slate-800 shadow-2xl relative ${
                          aspectRatio === '9:16' ? 'max-w-[200px] aspect-[9/16]' : 'w-full aspect-video'
                        }`}
                      >
                        <video src={videoResultUrl} controls className="w-full h-full object-cover" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 flex flex-col items-center text-slate-500">
                      <Film className="w-10 h-10 stroke-[1.5]" />
                      <div className="text-xs font-medium">Veo Output Viewport</div>
                      <p className="text-[11px] max-w-xs">Output MP4 vector streams will render here once generation is complete.</p>
                    </div>
                  )}

                  {videoError && (
                    <div className="absolute bottom-4 left-4 right-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2 text-left">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{videoError}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <CreativeStudioAside />
          </div>
        )}

        {activeSubTab === 'transcribe' && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8 space-y-6">
              <div className="flex items-center gap-3.5 border-b border-slate-800 pb-4">
                <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                  <Mic className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-extrabold tracking-tight text-zinc-100 sm:text-2xl">Gemini Transcribe Audio Platform</h2>
                  <p className="text-xs text-slate-400">Capture microphone audio and extract transcription text.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                <div className="space-y-4 min-w-0">
                  <div className="border border-slate-800 bg-slate-950/40 p-5 rounded-xl text-center space-y-4 flex flex-col items-center justify-center min-h-[220px]">
                    {isRecording ? (
                      <div className="space-y-4 flex flex-col items-center">
                        <div className="relative">
                          <span className="absolute -inset-1.5 rounded-full bg-rose-500/20 animate-ping" />
                          <div className="w-14 h-14 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20">
                            <Mic className="w-6 h-6" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-rose-400">Capturing Mic Audio Stream</span>
                          <p className="text-[11px] text-slate-400">Speak clearly. Click the button below to stop recording.</p>
                        </div>
                        <button
                          type="button"
                          onClick={stopRecording}
                          className="min-h-11 py-2 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 cursor-pointer font-semibold transition-all"
                        >
                          Stop Recording
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 flex flex-col items-center">
                        <button
                          type="button"
                          onClick={startRecording}
                          className="w-14 h-14 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                          title="Start Recording"
                        >
                          <Mic className="w-6 h-6" />
                        </button>
                        <div className="space-y-1">
                          <span className="text-xs font-bold text-slate-200">Start Micro Recording</span>
                          <p className="text-[11px] text-slate-400">Initiates direct local browser recording.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {recordedAudioUrl && (
                    <div className="border border-slate-800 bg-slate-950/40 p-4 rounded-xl space-y-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Playback Audio Stream</span>
                      <audio src={recordedAudioUrl} controls className="w-full h-9 accent-cyan-500" />
                      <button
                        type="button"
                        onClick={handleTranscribe}
                        disabled={isTranscribing}
                        className="w-full min-h-11 py-2 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40"
                      >
                        {isTranscribing ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            Transcribing audio...
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-3.5 h-3.5" />
                            Perform Gemini Transcription
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="border border-slate-800 bg-slate-950/30 rounded-xl p-5 flex flex-col min-h-[300px] min-w-0">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <span className="text-xs font-bold text-slate-300">Transcription Result</span>
                    {transcriptionResult && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(transcriptionResult, 'transcribe')}
                        className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === 'transcribe' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copy Text
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col justify-center min-w-0">
                    {isTranscribing ? (
                      <div className="text-center space-y-3">
                        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
                        <div className="text-xs text-slate-400 font-medium">Extracting textual representation...</div>
                      </div>
                    ) : transcriptionResult ? (
                      <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl flex-1 text-xs text-slate-200 leading-relaxed font-mono overflow-y-auto whitespace-pre-wrap">
                        {transcriptionResult}
                      </div>
                    ) : (
                      <div className="text-center text-slate-500 space-y-2">
                        <FileAudio className="w-10 h-10 stroke-[1.5] mx-auto" />
                        <div className="text-xs font-medium">No active transcription</div>
                        <p className="text-[11px] max-w-xs mx-auto">Record your voice and transcribe to generate transcripts here.</p>
                      </div>
                    )}
                  </div>

                  {transcribeError && (
                    <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{transcribeError}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <CreativeStudioAside />
          </div>
        )}
      </div>
    </div>
  );
};

function CreativeStudioAside() {
  return (
    <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-white/5 p-4 lg:block">
      <div className="space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="font-bold text-xs text-white uppercase tracking-wider">Creative Studio</h3>
        </div>
        <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-3">
          <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            Multimodal Creative Suite
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Synthesize text-to-music with Lyria, generate frame animations with Veo 3, or transcribe audio via Gemini.
          </p>
        </div>
        <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
          <span>Engine: Multi-provider router</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Operational
          </span>
        </div>
      </div>
    </aside>
  );
}
