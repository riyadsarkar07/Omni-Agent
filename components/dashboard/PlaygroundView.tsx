'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Agent, Project } from '@/lib/types';
import { AIProvider } from '@/lib/providers/types';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Trash2,
  RefreshCw,
  Brain,
  Wrench,
  Gauge,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Music,
  Video,
  Mic,
  Image as ImageIcon,
  Play,
  Volume2,
  FileAudio,
  Film,
  Sparkle,
  Upload,
  Wand2,
} from 'lucide-react';

interface PlaygroundViewProps {
  agents: Agent[];
  activeProject: Project | null;
  onRefreshAgents: () => void;
}

interface MessageItem {
  id: string;
  role: 'user' | 'model' | 'tool';
  text: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown>; result?: Record<string, unknown> }>;
  latencyMs?: number;
  tokens?: number;
  model?: string;
  isStreaming?: boolean;
}

export const PlaygroundView: React.FC<PlaygroundViewProps> = ({ agents, activeProject }) => {
  // Navigation Tabs
  const [activeSubTab, setActiveSubTab] = useState<'chatbot' | 'music' | 'video' | 'transcribe'>('chatbot');

  // Common UI State
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ----------------------------------------------------
  // 1. AI CHATBOT TAB STATE & LOGIC
  // ----------------------------------------------------
  const initialAgent = agents[0];
  const [selectedAgentId, setSelectedAgentId] = useState<string>(initialAgent?.id || '');
  const [model, setModel] = useState<string>(initialAgent?.model || 'gemini-3.8-flash');
  const [selectedRole, setSelectedRole] = useState<string>('custom');
  const [thinkingMode, setThinkingMode] = useState<boolean>(
    initialAgent?.thinking_level === 'HIGH' || initialAgent?.model === 'gemini-3.1-pro-preview'
  );
  const [useStreaming, setUseStreaming] = useState<boolean>(true);
  const [systemInstructions, setSystemInstructions] = useState<string>(
    initialAgent?.system_instructions || ''
  );
  const [temperature, setTemperature] = useState<number>(initialAgent?.temperature ?? 0.7);

  const [inputMessage, setInputMessage] = useState<string>('');
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [conversationId, setConversationId] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [providers, setProviders] = useState<AIProvider[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatLoading]);

  useEffect(() => {
    fetch('/api/v1/providers')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.providers) {
          setProviders(data.providers);
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    const agent = agents.find((a) => a.id === agentId);
    if (agent) {
      setModel(agent.model);
      setSystemInstructions(agent.system_instructions);
      setTemperature(agent.temperature);
      setThinkingMode(agent.thinking_level === 'HIGH' || agent.model === 'gemini-3.1-pro-preview');
      setSelectedRole('custom');
    }
  };

  const handleRoleChange = (role: string) => {
    setSelectedRole(role);
    if (role === 'programmer') {
      setSystemInstructions('You are an expert Software Engineer. Write pristine, performant, beautifully commented TypeScript, SQL, and CSS. Prefer elegant modular architectural designs.');
    } else if (role === 'security') {
      setSystemInstructions('You are a paranoid Database Security Engineer and Cyber Auditor. Scan inputs, architectures, and SQL queries for logical vulnerabilities, injections, or insecure configurations.');
    } else if (role === 'writer') {
      setSystemInstructions('You are a professional Creative Writer. Formulate highly engaging, vivid stories with superb dialogue and rich metaphors.');
    } else if (role === 'assistant') {
      setSystemInstructions('You are a highly efficient, supportive, and kind general assistant. Be crisp and informative.');
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = inputMessage.trim();
    if (!prompt || isChatLoading) return;

    setChatError(null);
    setInputMessage('');

    const userMsgId = `user_${Date.now()}`;
    const newMessages: MessageItem[] = [
      ...messages,
      {
        id: userMsgId,
        role: 'user',
        text: prompt,
      },
    ];
    setMessages(newMessages);
    setIsChatLoading(true);

    const modelToUse = model;
    const thinkingLevelToUse = thinkingMode ? 'HIGH' : 'OFF';

    if (useStreaming) {
      const modelMsgId = `model_${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: modelMsgId,
          role: 'model',
          text: '',
          isStreaming: true,
          model: modelToUse,
        },
      ]);

      const selectedAgent = agents.find((a) => a.id === selectedAgentId);
      const matchedProvider =
        providers.find((p) => p.enabled && (p.defaultModel === modelToUse || (p.models || []).includes(modelToUse))) ||
        (!modelToUse.toLowerCase().includes('gemini')
          ? providers.find((p) => p.enabled && p.protocol !== 'gemini' && p.id !== 'gemini')
          : undefined);
      const activeProviderId =
        (selectedAgent?.provider_id && selectedAgent.provider_id !== 'gemini' ? selectedAgent.provider_id : undefined) ||
        matchedProvider?.id;

      try {
        const res = await fetch('/api/v1/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: prompt,
            agentId: selectedAgentId || undefined,
            conversationId: conversationId || undefined,
            overrideModel: modelToUse,
            overrideProviderId: activeProviderId,
            thinkingLevel: thinkingLevelToUse,
          }),
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || errData.error || 'Failed to stream response');
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n');

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data:')) {
                const dataJson = trimmed.slice(5).trim();
                if (dataJson) {
                  try {
                    const parsed = JSON.parse(dataJson);
                    if (parsed.type === 'start') {
                      if (parsed.conversationId) setConversationId(parsed.conversationId);
                    } else if (parsed.type === 'chunk') {
                      accumulated += parsed.text;
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === modelMsgId ? { ...m, text: accumulated, isStreaming: true } : m
                        )
                      );
                    } else if (parsed.type === 'done') {
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === modelMsgId
                            ? {
                                ...m,
                                text: accumulated,
                                isStreaming: false,
                                latencyMs: parsed.usage?.latencyMs,
                                tokens: parsed.usage?.totalTokens,
                              }
                            : m
                        )
                      );
                    } else if (parsed.type === 'error') {
                      setChatError(parsed.error);
                    }
                  } catch {
                    // Ignore parsing glitches on streaming edge boundary
                  }
                }
              }
            }
          }
        }
      } catch (err: unknown) {
        setChatError((err as Error).message);
        setMessages((prev) => prev.filter((m) => m.id !== modelMsgId || m.text.length > 0));
      } finally {
        setIsChatLoading(false);
      }
    } else {
      const startTime = Date.now();
      const selectedAgent = agents.find((a) => a.id === selectedAgentId);
      const matchedProvider =
        providers.find((p) => p.enabled && (p.defaultModel === modelToUse || (p.models || []).includes(modelToUse))) ||
        (!modelToUse.toLowerCase().includes('gemini')
          ? providers.find((p) => p.enabled && p.protocol !== 'gemini' && p.id !== 'gemini')
          : undefined);
      const activeProviderId =
        (selectedAgent?.provider_id && selectedAgent.provider_id !== 'gemini' ? selectedAgent.provider_id : undefined) ||
        matchedProvider?.id;
      try {
        const res = await fetch('/api/v1/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: prompt,
            agentId: selectedAgentId || undefined,
            conversationId: conversationId || undefined,
            overrideModel: modelToUse,
            overrideProviderId: activeProviderId,
            thinkingLevel: thinkingLevelToUse,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || 'Chat request failed');
        }

        if (data.conversationId) setConversationId(data.conversationId);

        setMessages((prev) => [
          ...prev,
          {
            id: `model_${Date.now()}`,
            role: 'model',
            text: data.message,
            toolCalls: data.toolCalls,
            latencyMs: data.usage?.latencyMs || Date.now() - startTime,
            tokens: data.usage?.totalTokens,
            model: data.model,
          },
        ]);
      } catch (err: unknown) {
        setChatError((err as Error).message);
      } finally {
        setIsChatLoading(false);
      }
    }
  };

  // ----------------------------------------------------
  // 2. MUSIC GENERATION TAB STATE & LOGIC
  // ----------------------------------------------------
  const [musicPrompt, setMusicPrompt] = useState<string>('A lush cinematic synthwave track with analog synthesizers, futuristic pulse, and retro basslines');
  const [musicType, setMusicType] = useState<'clip' | 'pro'>('clip');
  const [isMusicLoading, setIsMusicLoading] = useState<boolean>(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [musicResult, setMusicResult] = useState<{ audio: string; lyrics: string | null; model: string } | null>(null);

  const handleGenerateMusic = async () => {
    setIsMusicLoading(true);
    setMusicError(null);
    setMusicResult(null);

    try {
      const res = await fetch('/api/creative/music', {
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
    } catch (err: any) {
      setMusicError(err.message || 'An error occurred while generating music');
    } finally {
      setIsMusicLoading(false);
    }
  };

  // ----------------------------------------------------
  // 3. VEO 3 VIDEO GENERATION TAB STATE & LOGIC
  // ----------------------------------------------------
  const [videoPrompt, setVideoPrompt] = useState<string>('A photorealistic cyberpunk drone flying through neon-lit futuristic skyscraper alleys, rainy reflections, high speed');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [isVideoLoading, setIsVideoLoading] = useState<boolean>(false);
  const [videoStatusText, setVideoStatusText] = useState<string>('');
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoResultUrl, setVideoResultUrl] = useState<string | null>(null);
  const statusPollingRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleGenerateVideo = async () => {
    setIsVideoLoading(true);
    setVideoError(null);
    setVideoResultUrl(null);
    setVideoStatusText('Initializing Veo 3 Video Engine...');

    try {
      const res = await fetch('/api/creative/video', {
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

      const operationName = data.operationName;
      setVideoStatusText('Rendering video frames (this may take up to 2-3 minutes)...');

      // Poll Video Generation status
      pollVideoStatus(operationName);
    } catch (err: any) {
      setVideoError(err.message || 'An error occurred while launching video generation');
      setIsVideoLoading(false);
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
        const res = await fetch('/api/creative/video/status', {
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
          // Cycle reassuring status updates
          setVideoStatusText(pollingTexts[pollingIdx % pollingTexts.length]);
          pollingIdx++;
        }
      } catch (err: any) {
        if (statusPollingRef.current) clearInterval(statusPollingRef.current);
        setVideoError(err.message || 'Error occurred while checking video compilation status');
        setIsVideoLoading(false);
      }
    }, 8000);
  };

  useEffect(() => {
    return () => {
      if (statusPollingRef.current) clearInterval(statusPollingRef.current);
    };
  }, []);

  // ----------------------------------------------------
  // 4. MICROPHONE TRANSCRIBE TAB STATE & LOGIC
  // ----------------------------------------------------
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

        // Stop micro capture stream track
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err: any) {
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
      const res = await fetch('/api/creative/transcribe', {
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
    } catch (err: any) {
      setTranscribeError(err.message || 'An error occurred during transcription');
    } finally {
      setIsTranscribing(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-[calc(100vh-8.5rem)] flex flex-col lg:flex-row gap-4">
      {/* Left Area: Creative Playground Tabs & Viewport */}
      <div className="flex-1 flex flex-col glass-panel border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        {/* Horizontal Navigation Sub-Tabs bar */}
        <div className="flex border-b border-white/5 bg-zinc-950/40 p-1 shrink-0 gap-1 overflow-x-auto select-none">
          <button
            onClick={() => setActiveSubTab('chatbot')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'chatbot'
                ? 'bg-zinc-800 text-zinc-100 border border-white/5'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Bot className="w-4 h-4" />
            AI Chatbot Presets
          </button>
          <button
            onClick={() => setActiveSubTab('music')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'music'
                ? 'bg-zinc-800 text-zinc-100 border border-white/5'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Music className="w-4 h-4" />
            Music Lab (Lyria)
          </button>
          <button
            onClick={() => setActiveSubTab('video')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'video'
                ? 'bg-zinc-800 text-zinc-100 border border-white/5'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Video className="w-4 h-4" />
            Video Lab (Veo 3)
          </button>
          <button
            onClick={() => setActiveSubTab('transcribe')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'transcribe'
                ? 'bg-zinc-800 text-zinc-100 border border-white/5'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Mic className="w-4 h-4" />
            Audio Transcriber
          </button>
        </div>

        {/* ----------------------------------------------------
            VIEWPORTS BY ACTIVE SUB-TAB
           ---------------------------------------------------- */}

        {/* 1. CHATBOT TAB VIEWPORT */}
        {activeSubTab === 'chatbot' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Thread Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-zinc-500/20 via-zinc-500/20 to-zinc-500/20 border border-white/5 flex items-center justify-center animate-pulse">
                    <Sparkles className="w-7 h-7 text-zinc-400" />
                  </div>
                  <div className="max-w-md space-y-1">
                    <h3 className="font-bold text-sm text-zinc-100">System Preset Chat playground</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Send a message to interact with your configured agents. Multi-turn context is retained across conversations automatically.
                    </p>
                  </div>

                  {/* Sample Prompts */}
                  <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-lg">
                    {[
                      'List three major security concerns in cloud environments',
                      'Design an elegant Next.js layouts structure template',
                      'Write a short poetic metaphor about deep learning architectures',
                    ].map((sample) => (
                      <button
                        key={sample}
                        onClick={() => setInputMessage(sample)}
                        className="text-[11px] px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-white/5 text-zinc-300 hover:text-zinc-100 transition-all cursor-pointer text-left"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-zinc-500/10">
                        <Bot className="w-4 h-4 text-zinc-100" />
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 space-y-2 text-xs leading-relaxed shadow-sm ${
                        isUser
                          ? 'bg-zinc-100 text-zinc-950 rounded-tr-none'
                          : 'bg-zinc-800/90 text-zinc-100 border border-white/5 rounded-tl-none'
                      }`}
                    >
                      {/* Message text */}
                      <div className="whitespace-pre-wrap font-sans">{msg.text || (msg.isStreaming ? '...' : '')}</div>

                      {/* Reply Stats Footer */}
                      {!isUser && (
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-400">
                          <div className="flex items-center gap-3">
                            {msg.latencyMs && (
                              <span className="flex items-center gap-1">
                                <Gauge className="w-3.5 h-3.5 text-zinc-400" />
                                {msg.latencyMs}ms
                              </span>
                            )}
                            {msg.tokens && <span>{msg.tokens} tokens</span>}
                          </div>
                          <button
                            onClick={() => copyToClipboard(msg.text, msg.id)}
                            className="hover:text-zinc-200 transition-colors p-1 cursor-pointer"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {isUser && (
                      <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="w-4 h-4 text-zinc-200" />
                      </div>
                    )}
                  </div>
                );
              })}

              {isChatLoading && !useStreaming && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-zinc-600/30 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-zinc-400 animate-pulse" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-zinc-800/80 border border-white/5 rounded-tl-none flex items-center gap-2 text-xs text-zinc-300">
                    <span className="w-2 h-2 rounded-full bg-zinc-400 animate-ping" />
                    Gemini chatbot is thinking...
                  </div>
                </div>
              )}

              {chatError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{chatError}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input form */}
            <div className="p-3 border-t border-white/5 bg-zinc-950/80 shrink-0">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Query chatbot (e.g. 'Can you explain the security measures of our architecture?')..."
                  className="flex-1 bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none transition-all focus:border-zinc-500"
                  disabled={isChatLoading}
                />
                <button
                  type="submit"
                  disabled={isChatLoading || !inputMessage.trim()}
                  className="px-4 py-2.5 rounded-xl bg-white text-zinc-950 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                >
                  {isChatLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* 2. MUSIC LAB TAB VIEWPORT */}
        {activeSubTab === 'music' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
            <div className="flex items-center gap-3.5 border-b border-slate-800 pb-4">
              <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                <Music className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-2">
                  Lyria Creative Audio Engine
                  <span className="text-[10px] bg-zinc-500/20 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-500/30">
                    Paid Key Optional
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Generate high-fidelity audio clips and full-length soundtrack arrays from text descriptors.</p>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Soundtrack Architecture</label>
                  <select
                    value={musicType}
                    onChange={(e) => setMusicType(e.target.value as 'clip' | 'pro')}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="clip">Lyria Clip (Up to 30s Promo, Fast)</option>
                    <option value="pro">Lyria Pro (Full-Length HQ Production Track)</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={handleGenerateMusic}
                    disabled={isMusicLoading || !musicPrompt.trim()}
                    className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 transition-all cursor-pointer disabled:opacity-40"
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
                    <FileAudio className="w-5 h-5 animate-pulse" />
                  </div>
                  <audio src={musicResult.audio} controls className="flex-1 h-9 accent-cyan-500" />
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
        )}

        {/* 3. VIDEO LAB TAB VIEWPORT */}
        {activeSubTab === 'video' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
            <div className="flex items-center gap-3.5 border-b border-slate-800 pb-4">
              <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                <Video className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-2">
                  Veo 3 Video Motion Engine
                  <span className="text-[10px] bg-zinc-500/20 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-500/30">
                    Model: veo-3.1-fast-generate-preview
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Animate static reference images or synthesize high-fidelity clips from text commands.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
              <div className="space-y-4">
                {/* Mode Selector */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Veo Aspect Ratio</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAspectRatio('16:9')}
                      className={`flex-1 py-2 px-3 text-xs rounded-xl font-medium border transition-all cursor-pointer ${
                        aspectRatio === '16:9'
                          ? 'bg-slate-800 border-cyan-500/30 text-cyan-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Landscape (16:9)
                    </button>
                    <button
                      onClick={() => setAspectRatio('9:16')}
                      className={`flex-1 py-2 px-3 text-xs rounded-xl font-medium border transition-all cursor-pointer ${
                        aspectRatio === '9:16'
                          ? 'bg-slate-800 border-cyan-500/30 text-cyan-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Portrait (9:16)
                    </button>
                  </div>
                </div>

                {/* Video Prompt */}
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

                {/* Upload Reference Image for Animate Photo */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">Animate Photo (Optional starting frame)</label>
                  <div className="flex gap-3 items-center">
                    <label className="cursor-pointer flex items-center gap-2 py-2 px-4 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 transition-all shrink-0">
                      <Upload className="w-4 h-4 text-slate-400" />
                      Upload Photo
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    {uploadedImagePreview && (
                      <div className="relative w-12 h-12 rounded-lg border border-slate-800 overflow-hidden shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={uploadedImagePreview} alt="starting frame" className="object-cover w-full h-full" />
                        <button
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

                {/* Submit */}
                <button
                  onClick={handleGenerateVideo}
                  disabled={isVideoLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10 transition-all cursor-pointer disabled:opacity-40"
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

              {/* View Output column */}
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
                    <div className={`mx-auto rounded-lg overflow-hidden border border-slate-800 shadow-2xl relative ${
                      aspectRatio === '9:16' ? 'max-w-[200px] aspect-[9/16]' : 'w-full aspect-video'
                    }`}>
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
        )}

        {/* 4. TRANSCRIBE TAB VIEWPORT */}
        {activeSubTab === 'transcribe' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
            <div className="flex items-center gap-3.5 border-b border-slate-800 pb-4">
              <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
                <Mic className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-zinc-100 flex items-center gap-2">
                  Gemini Transcribe Audio Platform
                  <span className="text-[10px] bg-zinc-500/20 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-500/30">
                    Model: gemini-3.5-transcribe
                  </span>
                </h2>
                <p className="text-xs text-slate-400">Capture direct micro audio or process uploaded streams to extract precision multilingual transcription text.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
              <div className="space-y-4">
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
                        onClick={stopRecording}
                        className="py-2 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-200 cursor-pointer font-semibold transition-all"
                      >
                        Stop Recording
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 flex flex-col items-center">
                      <button
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
                      onClick={handleTranscribe}
                      disabled={isTranscribing}
                      className="w-full py-2 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40"
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

              {/* Right column text container */}
              <div className="border border-slate-800 bg-slate-950/30 rounded-xl p-5 flex flex-col min-h-[300px]">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                  <span className="text-xs font-bold text-slate-300">Transcription Result</span>
                  {transcriptionResult && (
                    <button
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

                <div className="flex-1 flex flex-col justify-center">
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
                      <p className="text-[11px] max-w-xs mx-auto">Record your voice or import audio and hit Synthesize to generate transcripts here.</p>
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
        )}
      </div>

      {/* Right Area: Sidebar Config Controls (Adaptive based on active tab) */}
      <div className="w-full lg:w-80 glass-card border border-white/5 rounded-2xl p-4 flex flex-col justify-between overflow-y-auto space-y-4">
        {activeSubTab === 'chatbot' ? (
          <div className="space-y-4">
            <div className="border-b border-white/5 pb-3 flex items-center justify-between">
              <h3 className="font-bold text-xs text-white uppercase tracking-wider">Agent Parameters</h3>
              <span className="text-[10px] text-zinc-400 font-medium font-mono">Live Config</span>
            </div>

            {/* Select Agent Preset */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400">Target Agent Preset</label>
              <select
                value={selectedAgentId}
                onChange={(e) => handleSelectAgent(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 cursor-pointer"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Select Chatbot Role */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400">Gemini System Persona / Role</label>
              <select
                value={selectedRole}
                onChange={(e) => handleRoleChange(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 cursor-pointer"
              >
                <option value="custom">Custom (Defined by Agent Preset)</option>
                <option value="programmer">Software Architect & Engineer</option>
                <option value="security">Database Security Expert</option>
                <option value="writer">Creative Novelist & Storyteller</option>
                <option value="assistant">General Supportive Assistant</option>
              </select>
            </div>

            {/* Dynamic Model Selector grouped by Provider */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400">AI Model Router</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 cursor-pointer"
              >
                {providers.length === 0 ? (
                  <>
                    <option value="gemini-3.8-flash">Gemini 3.8 Flash (General Tasks)</option>
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Reasoning & Coding)</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Ultra-Low Latency)</option>
                  </>
                ) : (
                  providers
                    .filter((p) => p.enabled)
                    .map((p) => (
                      <optgroup key={p.id} label={p.name} className="bg-zinc-900 text-zinc-300 font-bold">
                        {p.models.map((m) => (
                          <option key={`${p.id}:${m}`} value={m} className="bg-zinc-950 text-zinc-100 font-normal">
                            {m}
                          </option>
                        ))}
                      </optgroup>
                    ))
                )}
              </select>
            </div>

            {/* Thinking Mode Switch */}
            <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                  <Brain className="w-3.5 h-3.5 text-indigo-400" />
                  High Thinking Mode
                </div>
                <input
                  type="checkbox"
                  checked={thinkingMode}
                  onChange={(e) => setThinkingMode(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                />
              </div>
              <p className="text-[10px] text-zinc-400 leading-tight">
                Forces standard high reasoning mode logic with ThinkingLevel.HIGH parameters.
              </p>
            </div>

            {/* SSE Switch */}
            <div className="p-3 rounded-lg bg-zinc-800/40 border border-white/5 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-zinc-200">Server-Sent Events (SSE)</div>
                <div className="text-[10px] text-zinc-400">Stream tokens in real-time</div>
              </div>
              <input
                type="checkbox"
                checked={useStreaming}
                onChange={(e) => setUseStreaming(e.target.checked)}
                className="w-4 h-4 accent-zinc-500 rounded cursor-pointer"
              />
            </div>

            {/* Temperature Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-semibold text-zinc-400">
                <span>Temperature</span>
                <span className="text-zinc-400">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-zinc-500 cursor-pointer"
              />
            </div>

            {/* System Instructions Preview */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-zinc-400">Active System Instruction</label>
              <textarea
                rows={3}
                value={systemInstructions}
                onChange={(e) => setSystemInstructions(e.target.value)}
                className="w-full bg-zinc-950 border border-white/10 rounded-lg p-2.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500 resize-none font-sans"
                placeholder="Persona system instruction context..."
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="font-bold text-xs text-white uppercase tracking-wider">Creative Studio</h3>
            </div>

            <div className="rounded-lg bg-slate-900 border border-slate-800 p-4 space-y-3">
              <div className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 animate-spin" />
                Multimodal Creative Suite
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Seamlessly synthesize text-to-music with Lyria, generate frame animations with Veo 3, or perform micro audio translation transcribing via Gemini.
              </p>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">SDK Modalities Supported</span>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['Audio Generation', 'WAV Unary', 'Frame interpolation', 'Veo 3 fast render', 'Web Audio MediaRecorder'].map((tag) => (
                  <span key={tag} className="text-[9px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Engine Footnote */}
        <div className="pt-3 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
          <span>Engine: Multi-provider router</span>
          <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            Operational
          </span>
        </div>
      </div>
    </div>
  );
};
