'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Agent, ChatMessage as StoredChatMessage, Conversation, Project } from '@/lib/types';
import { AIProvider } from '@/lib/providers/types';
import { apiFetch } from '@/lib/auth/session-client';
import { AlertCircle, Eraser, Menu, Settings2 } from 'lucide-react';
import { ChatComposer } from './ChatComposer';
import { ChatMessageBubble } from './ChatMessage';
import { ConversationSidebar } from './ConversationSidebar';
import { AgentParameters } from './AgentParameters';
import { EmptyPlayground } from './EmptyPlayground';
import { MobileNavigationDrawer } from './MobileNavigationDrawer';
import { MobileAgentSheet } from './MobileAgentSheet';
import { VoiceConversation } from './VoiceConversation';
import { ClassifiedChatError, PlaygroundMessage } from './types';
import { classifyChatError } from './errors';
import { PendingAttachment } from './AttachmentPreview';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

const PERSONA_PROMPTS: Record<string, string> = {
  programmer:
    'You are an expert Software Engineer. Write pristine, performant, beautifully commented TypeScript, SQL, and CSS. Prefer elegant modular architectural designs.',
  security:
    'You are a paranoid Database Security Engineer and Cyber Auditor. Scan inputs, architectures, and SQL queries for logical vulnerabilities, injections, or insecure configurations.',
  writer:
    'You are a professional Creative Writer. Formulate highly engaging, vivid stories with superb dialogue and rich metaphors.',
  assistant: 'You are a highly efficient, supportive, and kind general assistant. Be crisp and informative.',
};

function supportsThinking(model: string, provider?: AIProvider): boolean {
  const protocol = provider?.protocol;
  if (protocol && protocol !== 'gemini') return false;
  return model.toLowerCase().includes('pro') || model.toLowerCase().includes('gemini');
}

function thinkingEnabledForModel(model: string, provider?: AIProvider): boolean {
  if (!supportsThinking(model, provider)) return false;
  return model.toLowerCase().includes('pro');
}

interface ChatWorkspaceProps {
  agents: Agent[];
  activeProject: Project | null;
  initialConversationId?: string;
  initialAgentId?: string;
}

export const ChatWorkspace: React.FC<ChatWorkspaceProps> = ({ agents, activeProject, initialConversationId, initialAgentId }) => {
  const initialAgent = agents.find((a) => a.id === initialAgentId) || agents[0];
  const [selectedAgentId, setSelectedAgentId] = useState<string>(initialAgent?.id || '');
  const [model, setModel] = useState<string>(initialAgent?.model || '');
  const [selectedRole, setSelectedRole] = useState<string>('custom');
  const [thinkingLevel, setThinkingLevel] = useState<'HIGH' | 'LOW' | 'MINIMAL' | 'OFF'>(
    initialAgent?.thinking_level === 'HIGH' ? 'HIGH' : 'OFF'
  );
  const [useStreaming, setUseStreaming] = useState(true);
  const [systemInstructions, setSystemInstructions] = useState(initialAgent?.system_instructions || '');
  const [temperature, setTemperature] = useState(initialAgent?.temperature ?? 0.7);
  const [maxOutputTokens, setMaxOutputTokens] = useState(initialAgent?.max_output_tokens || 2048);
  const [topP, setTopP] = useState(initialAgent?.top_p ?? 0.95);
  const [topK, setTopK] = useState(initialAgent?.top_k ?? 40);
  const [memoryEnabled, setMemoryEnabled] = useState(initialAgent?.memory_enabled ?? true);
  const [toolsEnabled, setToolsEnabled] = useState<string[]>(initialAgent?.tools_enabled || []);

  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
  const [conversationId, setConversationId] = useState(initialConversationId || '');
  const loadedInitialConversationRef = useRef<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<ClassifiedChatError | null>(null);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const attachmentsRef = useRef<PendingAttachment[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef('');

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const applyTranscript = useCallback((text: string, isFinal: boolean) => {
    const piece = text.trim();
    if (!piece) return;
    if (isFinal) {
      setInterimTranscript('');
      setInputMessage((prev) => {
        const base = prev.trim();
        return base ? `${base} ${piece}` : piece;
      });
      return;
    }
    setInterimTranscript(piece);
  }, []);

  const speech = useSpeechRecognition(applyTranscript);

  useEffect(() => {
    if (!initialConversationId) return;
    if (loadedInitialConversationRef.current === initialConversationId) return;
    loadedInitialConversationRef.current = initialConversationId;
    let cancelled = false;
    apiFetch(`/api/v1/conversations/${initialConversationId}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled || !res.ok) return;
        const loaded: PlaygroundMessage[] = ((data.messages as StoredChatMessage[]) || []).map((m) => ({
          id: m.id,
          role: m.role === 'user' ? 'user' : 'model',
          text: m.content,
          toolCalls: m.tool_calls?.map((t) => ({
            name: t.name,
            args: t.args,
            result: m.tool_results?.find((r) => r.name === t.name)?.response,
          })),
          tokens: m.tokens_used,
        }));
        setMessages(loaded);
        const agentId = data.conversation?.agent_id as string | undefined;
        if (agentId) {
          const agent = agents.find((a) => a.id === agentId);
          if (agent) {
            setSelectedAgentId(agent.id);
            setModel(agent.model);
            setSystemInstructions(agent.system_instructions);
            if (agent.provider_id) setSelectedProviderId(agent.provider_id);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialConversationId, agents]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatLoading]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiFetch('/api/v1/conversations');
      const data = await res.json();
      if (res.ok && Array.isArray(data.conversations)) {
        setConversations(data.conversations);
      }
    } catch {
      // keep existing list
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/v1/models')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data.success || !Array.isArray(data.models)) return;
        const byProvider = new Map<string, AIProvider>();
        for (const entry of data.models as Array<{
          id: string;
          providerId: string;
          providerName: string;
          protocol?: AIProvider['protocol'];
          capabilities?: AIProvider['capabilities'];
          vision?: boolean;
          isDefault?: boolean;
        }>) {
          const existing = byProvider.get(entry.providerId);
          if (existing) {
            if (!existing.models.includes(entry.id)) existing.models.push(entry.id);
            if (entry.isDefault) {
              existing.isDefault = true;
              existing.defaultModel = entry.id;
            }
            if (entry.vision && !existing.capabilities.includes('VISION')) existing.capabilities.push('VISION');
            continue;
          }
          const capabilities = [...(entry.capabilities || ['TEXT' as const])];
          if (entry.vision && !capabilities.includes('VISION')) capabilities.push('VISION');
          byProvider.set(entry.providerId, {
            id: entry.providerId,
            name: entry.providerName,
            type: 'openai-compatible',
            protocol: entry.protocol || 'openai',
            baseUrl: '',
            enabled: true,
            defaultModel: entry.id,
            models: [entry.id],
            capabilities,
            connectionStatus: 'Untested',
            isDefault: Boolean(entry.isDefault),
          });
        }
        const next = Array.from(byProvider.values());
        setProviders(next);
        if (data.defaultModel) {
          const match = next.find((p) => p.defaultModel === data.defaultModel || p.models.includes(data.defaultModel));
          if (match) setSelectedProviderId((prev) => prev || match.id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/v1/conversations')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.conversations)) return;
        setConversations(data.conversations);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeProject?.id]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];
  const enabledProviders = providers.filter((p) => p.enabled);
  const activeProvider =
    enabledProviders.find((p) => p.id === selectedProviderId) ||
    enabledProviders.find((p) => p.id === selectedAgent?.provider_id) ||
    enabledProviders.find((p) => p.defaultModel === model || (p.models || []).includes(model)) ||
    enabledProviders[0];
  const availableModels = (() => {
    const models = (activeProvider?.models || []).filter((m) => typeof m === 'string' && m.trim().length > 0);
    if (models.length > 0) return models;
    if (activeProvider?.defaultModel) return [activeProvider.defaultModel];
    if (selectedAgent?.model) return [selectedAgent.model];
    return [] as string[];
  })();
  const resolvedModel = availableModels.includes(model) ? model : availableModels[0] || '';
  const showThinking = thinkingEnabledForModel(resolvedModel, activeProvider);
  const resolvedThinking: 'HIGH' | 'LOW' | 'MINIMAL' | 'OFF' = showThinking ? thinkingLevel : 'OFF';
  const visionSupported = Boolean(
    activeProvider?.capabilities?.includes('VISION') ||
      /gemini|gpt-4o|gpt-4\.1|claude-3|claude-4|vision|vl-/.test((resolvedModel || '').toLowerCase())
  );

  const uploadAttachment = useCallback(async (localId: string, file: File) => {
    setAttachments((prev) =>
      prev.map((item) => (item.id === localId ? { ...item, status: 'uploading', progress: 15, error: undefined } : item))
    );
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await apiFetch('/api/v1/files', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || 'Upload failed');
      const fileId = data.file?.id as string | undefined;
      if (!fileId) throw new Error('Upload did not return a file id');
      setAttachments((prev) =>
        prev.map((item) =>
          item.id === localId ? { ...item, status: 'ready', progress: 100, fileId } : item
        )
      );
    } catch (err) {
      setAttachments((prev) =>
        prev.map((item) =>
          item.id === localId
            ? { ...item, status: 'error', progress: 0, error: (err as Error).message || 'Upload failed' }
            : item
        )
      );
    }
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const allowed = /\.(png|jpe?g|webp|pdf|txt|md|markdown|docx)$/i;
      const next: PendingAttachment[] = [];
      for (const file of files) {
        if (!allowed.test(file.name) && !file.type.startsWith('image/') && !['application/pdf', 'text/plain', 'text/markdown'].includes(file.type)) {
          continue;
        }
        if (file.size > 10 * 1024 * 1024) continue;
        const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
        next.push({
          id,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          previewUrl,
          status: 'pending',
          progress: 0,
          file,
        });
      }
      if (!next.length) return;
      setAttachments((prev) => [...prev, ...next].slice(0, 8));
      for (const item of next) {
        if (item.file) void uploadAttachment(item.id, item.file);
      }
    },
    [uploadAttachment]
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const found = prev.find((item) => item.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const retryAttachment = useCallback(
    (id: string) => {
      const found = attachmentsRef.current.find((item) => item.id === id);
      if (found?.file) void uploadAttachment(id, found.file);
    },
    [uploadAttachment]
  );

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgentId(agentId);
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setModel(agent.model);
    setSystemInstructions(agent.system_instructions);
    setTemperature(agent.temperature);
    setTopP(agent.top_p ?? 0.95);
    setTopK(agent.top_k ?? 40);
    setMaxOutputTokens(agent.max_output_tokens || 2048);
    setMemoryEnabled(agent.memory_enabled ?? true);
    setToolsEnabled(agent.tools_enabled || []);
    setThinkingLevel(agent.thinking_level === 'HIGH' ? 'HIGH' : 'OFF');
    setSelectedRole('custom');
    if (agent.provider_id) setSelectedProviderId(agent.provider_id);
  };

  const handleRoleChange = (role: string) => {
    setSelectedRole(role);
    if (PERSONA_PROMPTS[role]) setSystemInstructions(PERSONA_PROMPTS[role]);
  };

  const handleProviderChange = (id: string) => {
    setSelectedProviderId(id);
    const next = enabledProviders.find((p) => p.id === id);
    const nextModels = (next?.models || []).filter(Boolean);
    if (nextModels.length) setModel(nextModels[0]);
    else if (next?.defaultModel) setModel(next.defaultModel);
  };

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsChatLoading(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false, stopped: true } : m))
    );
  }, []);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // ignore
    }
  };

  const persistAgentOverrides = useCallback(async () => {
    if (!selectedAgent || selectedAgent.scope !== 'user') return;
    const instructions = (systemInstructions || selectedAgent.system_instructions || '').trim();
    try {
      await apiFetch(`/api/v1/agents/${selectedAgent.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: resolvedModel || selectedAgent.model,
          provider_id: activeProvider?.id || selectedAgent.provider_id,
          ...(instructions.length >= 5 ? { system_instructions: instructions } : {}),
          temperature,
          top_p: topP,
          top_k: topK,
          max_output_tokens: maxOutputTokens || undefined,
          thinking_level: resolvedThinking,
          memory_enabled: memoryEnabled,
          tools_enabled: toolsEnabled,
        }),
      });
    } catch {
      // Chat still proceeds with existing agent config if live save fails.
    }
  }, [
    selectedAgent,
    resolvedModel,
    activeProvider,
    systemInstructions,
    temperature,
    topP,
    topK,
    maxOutputTokens,
    resolvedThinking,
    memoryEnabled,
    toolsEnabled,
  ]);

  const sendPrompt = useCallback(
    async (prompt: string, options?: { replaceUserId?: string; regenerate?: boolean; attachmentSnapshot?: PendingAttachment[] }) => {
      const trimmed = prompt.trim();
      const ready = (options?.attachmentSnapshot || attachmentsRef.current).filter(
        (item) => item.status === 'ready' && item.fileId
      );
      if ((!trimmed && ready.length === 0) || isChatLoading) return;
      if (attachmentsRef.current.some((item) => item.status === 'uploading' || item.status === 'pending')) return;

      speech.stop();
      setInterimTranscript('');
      setChatError(null);
      setInputMessage('');
      const displayAttachments = ready.map((item) => ({
        id: item.fileId || item.id,
        name: item.name,
        type: item.type,
        size: item.size,
        previewUrl: item.previewUrl,
      }));
      if (!options?.regenerate) {
        setAttachments([]);
      }

      const userMsgId = options?.replaceUserId || `user_${Date.now()}`;
      setMessages((prev) => {
        let next = prev;
        if (options?.replaceUserId) {
          const idx = next.findIndex((m) => m.id === options.replaceUserId);
          if (idx >= 0) next = next.slice(0, idx);
          return [...next, { id: userMsgId, role: 'user', text: trimmed, attachments: displayAttachments }];
        }
        if (options?.regenerate) {
          while (next.length > 0 && next[next.length - 1].role === 'model') {
            next = next.slice(0, -1);
          }
          return next;
        }
        return [...next, { id: userMsgId, role: 'user', text: trimmed, attachments: displayAttachments }];
      });

      setIsChatLoading(true);
      await persistAgentOverrides();

      const thinkingLevelToUse = resolvedThinking === 'HIGH' ? 'HIGH' : 'OFF';
      const activeProviderId = activeProvider?.id || undefined;
      const controller = new AbortController();
      abortRef.current = controller;

      const body = {
        message: trimmed,
        agentId: selectedAgentId || undefined,
        conversationId: conversationIdRef.current || undefined,
        overrideModel: resolvedModel || undefined,
        overrideProviderId: activeProviderId,
        thinkingLevel: thinkingLevelToUse,
        attachmentIds: ready.map((item) => item.fileId!).filter(Boolean),
      };

      const finishError = (raw: string, status?: number) => {
        setChatError(classifyChatError(raw, status));
        setIsChatLoading(false);
        abortRef.current = null;
      };

      if (useStreaming) {
        const modelMsgId = `model_${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: modelMsgId,
            role: 'model',
            text: '',
            isStreaming: true,
            model: resolvedModel,
            provider: activeProvider?.name,
          },
        ]);

        try {
          const res = await apiFetch('/api/v1/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (!res.ok) {
            let errMessage = 'Failed to stream response';
            try {
              const errData = await res.json();
              errMessage = errData.message || errData.error || errMessage;
            } catch {
              // ignore
            }
            setMessages((prev) => prev.filter((m) => m.id !== modelMsgId || m.text.length > 0));
            finishError(errMessage, res.status);
            return;
          }

          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          let accumulated = '';
          let buffer = '';

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const events = buffer.split('\n\n');
              buffer = events.pop() || '';

              for (const event of events) {
                const trimmedEvent = event.trim();
                if (!trimmedEvent.startsWith('data:')) continue;
                const dataJson = trimmedEvent.slice(5).trim();
                if (!dataJson) continue;
                try {
                  const parsed = JSON.parse(dataJson);
                  if (parsed.type === 'start') {
                    if (parsed.conversationId) setConversationId(parsed.conversationId);
                    if (parsed.model) {
                      setMessages((prev) =>
                        prev.map((m) => (m.id === modelMsgId ? { ...m, model: parsed.model } : m))
                      );
                    }
                  } else if (parsed.type === 'chunk') {
                    accumulated += parsed.text || '';
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
                              model: parsed.model || m.model,
                              provider: activeProvider?.name,
                            }
                          : m
                      )
                    );
                  } else if (parsed.type === 'error') {
                    setChatError(classifyChatError(parsed.error || 'Streaming error'));
                  }
                } catch {
                  // Ignore parsing glitches on streaming edge boundary
                }
              }
            }
          }
          loadConversations();
        } catch (err: unknown) {
          if ((err as Error).name === 'AbortError') {
            setIsChatLoading(false);
            abortRef.current = null;
            return;
          }
          setMessages((prev) => prev.filter((m) => m.id !== modelMsgId || m.text.length > 0));
          finishError((err as Error).message || 'Network error');
          return;
        } finally {
          setIsChatLoading(false);
          abortRef.current = null;
        }
      } else {
        const startTime = Date.now();
        try {
          const res = await apiFetch('/api/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          const data = await res.json();
          if (!res.ok) {
            throw Object.assign(new Error(data.message || data.error || 'Chat request failed'), { status: res.status });
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
              provider: activeProvider?.name,
            },
          ]);
          loadConversations();
        } catch (err: unknown) {
          if ((err as Error).name === 'AbortError') return;
          finishError((err as Error).message, (err as { status?: number }).status);
          return;
        } finally {
          setIsChatLoading(false);
          abortRef.current = null;
        }
      }
    },
    [
      isChatLoading,
      persistAgentOverrides,
      resolvedThinking,
      activeProvider,
      selectedAgentId,
      resolvedModel,
      useStreaming,
      loadConversations,
      speech,
    ]
  );

  const handleNewChat = () => {
    stopGeneration();
    speech.stop();
    setMessages([]);
    setConversationId('');
    setChatError(null);
    setInputMessage('');
    setAttachments([]);
    setVoiceModeOpen(false);
    setDrawerOpen(false);
  };

  const handleOpenConversation = async (id: string) => {
    stopGeneration();
    setDrawerOpen(false);
    setConversationId(id);
    setChatError(null);
    try {
      const res = await apiFetch(`/api/v1/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to open conversation');
      const loaded: PlaygroundMessage[] = (data.messages as StoredChatMessage[] || []).map((m) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'model',
        text: m.content,
        toolCalls: m.tool_calls?.map((t) => ({
          name: t.name,
          args: t.args,
          result: m.tool_results?.find((r) => r.name === t.name)?.response,
        })),
        tokens: m.tokens_used,
      }));
      setMessages(loaded);
    } catch (err: unknown) {
      setChatError(classifyChatError((err as Error).message));
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await apiFetch(`/api/v1/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) handleNewChat();
    } catch {
      // ignore
    }
  };

  const handleRenameConversation = async (id: string, title: string) => {
    try {
      const res = await apiFetch(`/api/v1/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) return;
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    } catch {
      // ignore
    }
  };

  const lastUserText = [...messages].reverse().find((m) => m.role === 'user')?.text || '';
  const lastModel = [...messages].reverse().find((m) => m.role === 'model');

  const parameterProps = {
    agents,
    selectedAgentId: selectedAgent?.id || '',
    onSelectAgent: handleSelectAgent,
    selectedRole,
    onRoleChange: handleRoleChange,
    providers: enabledProviders,
    selectedProviderId: activeProvider?.id || '',
    onProviderChange: handleProviderChange,
    models: availableModels,
    model: resolvedModel,
    onModelChange: setModel,
    showThinking,
    thinkingLevel: resolvedThinking,
    onThinkingLevel: setThinkingLevel,
    useStreaming,
    onUseStreaming: setUseStreaming,
    temperature,
    onTemperature: setTemperature,
    systemInstructions,
    onSystemInstructions: setSystemInstructions,
    agent: selectedAgent,
    maxOutputTokens,
    topP,
    topK,
    memoryEnabled,
    toolsEnabled,
    onMaxOutputTokens: setMaxOutputTokens,
    onTopP: setTopP,
    onTopK: setTopK,
    onMemoryEnabled: setMemoryEnabled,
    onToolsEnabled: setToolsEnabled,
  };

  const sidebar = (
    <ConversationSidebar
      conversations={conversations}
      activeId={conversationId}
      collapsed={sidebarCollapsed}
      onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
      onNewChat={handleNewChat}
      onOpen={handleOpenConversation}
      onDelete={handleDeleteConversation}
      onRename={handleRenameConversation}
    />
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="hidden h-full min-h-0 lg:flex">{sidebar}</div>

      <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 lg:hidden">
          <button
            type="button"
            aria-label="Open conversations"
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-zinc-300"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0 text-center">
            <div className="truncate text-sm font-semibold text-zinc-100">OmniAgent</div>
            <div className="truncate text-[10px] text-zinc-500">{activeProvider?.name || 'Personal AI'}</div>
          </div>
          <button
            type="button"
            aria-label="Open agent parameters"
            onClick={() => setSheetOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-zinc-300"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </header>

        <div className="hidden items-center justify-between border-b border-white/5 px-4 py-2 lg:flex">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-100">OmniAgent Personal AI Command Center</div>
            <div className="truncate text-[11px] text-zinc-500">
              {activeProvider?.name || 'Provider'} {resolvedModel ? `· ${resolvedModel}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleNewChat}
              className="h-9 rounded-lg px-3 text-[12px] text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            >
              New Chat
            </button>
            <button
              type="button"
              onClick={() => {
                stopGeneration();
                setMessages([]);
                setChatError(null);
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[12px] text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-5">
          {messages.length === 0 && !isChatLoading && (
            <EmptyPlayground onPrompt={(p) => sendPrompt(p)} />
          )}

          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {messages.map((msg) => (
              <ChatMessageBubble
                key={msg.id}
                message={msg}
                onCopy={copyToClipboard}
                copiedId={copiedId}
                isLastModel={lastModel?.id === msg.id}
                isGenerating={isChatLoading}
                onStop={stopGeneration}
                onRegenerate={lastUserText ? () => sendPrompt(lastUserText, { regenerate: true }) : undefined}
                onRetry={lastUserText ? () => sendPrompt(lastUserText) : undefined}
                onEditResend={(text) => sendPrompt(text, { replaceUserId: msg.id })}
              />
            ))}

            {isChatLoading && !useStreaming && (
              <div className="flex items-center gap-2 text-[12px] text-zinc-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
                Generating...
              </div>
            )}

            {chatError && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold">{chatError.title}</div>
                    <p className="mt-0.5 text-rose-200/80">{chatError.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => lastUserText && sendPrompt(lastUserText, { regenerate: true })}
                        className="min-h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-[11px] font-medium text-zinc-100"
                      >
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => setSheetOpen(true)}
                        className="min-h-9 rounded-lg border border-white/10 px-3 text-[11px] font-medium text-zinc-300 lg:hidden"
                      >
                        Change Model
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <ChatComposer
          value={inputMessage}
          onChange={setInputMessage}
          onSend={() => sendPrompt(inputMessage)}
          onStop={stopGeneration}
          isGenerating={isChatLoading}
          attachments={attachments}
          onAddFiles={addFiles}
          onRemoveAttachment={removeAttachment}
          onRetryAttachment={retryAttachment}
          voiceListening={speech.listening}
          voiceSupport={speech.support}
          voiceError={speech.error}
          interimTranscript={interimTranscript}
          onToggleVoice={speech.toggle}
          onOpenVoiceMode={() => setVoiceModeOpen(true)}
          visionSupported={visionSupported}
        />
        {voiceModeOpen ? (
        <VoiceConversation
          open={voiceModeOpen}
          onClose={() => setVoiceModeOpen(false)}
          agentId={selectedAgentId || undefined}
          conversationId={conversationId}
          onConversationId={setConversationId}
          overrideModel={resolvedModel || undefined}
          overrideProviderId={activeProvider?.id}
          thinkingLevel={resolvedThinking}
          onUserUtterance={(text) =>
            setMessages((prev) => [...prev, { id: `user_${Date.now()}`, role: 'user', text }])
          }
          onAssistantUtterance={(text, meta) => {
            setMessages((prev) => [
              ...prev,
              {
                id: `model_${Date.now()}`,
                role: 'model',
                text,
                model: meta?.model,
                tokens: meta?.tokens,
                latencyMs: meta?.latencyMs,
                provider: activeProvider?.name,
              },
            ]);
            loadConversations();
          }}
        />
        ) : null}
      </section>

      <aside className="hidden h-full w-80 shrink-0 overflow-hidden border-l border-white/5 bg-zinc-950/30 xl:flex xl:flex-col">
        <AgentParameters {...parameterProps} />
      </aside>
      <aside className="hidden h-full w-72 shrink-0 overflow-hidden border-l border-white/5 bg-zinc-950/30 lg:flex lg:flex-col xl:hidden">
        <AgentParameters {...parameterProps} />
      </aside>

      <MobileNavigationDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <ConversationSidebar
          conversations={conversations}
          activeId={conversationId}
          collapsed={false}
          hideCollapse
          onToggleCollapsed={() => {}}
          onNewChat={handleNewChat}
          onOpen={handleOpenConversation}
          onDelete={handleDeleteConversation}
          onRename={handleRenameConversation}
        />
      </MobileNavigationDrawer>

      <MobileAgentSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <AgentParameters {...parameterProps} />
      </MobileAgentSheet>
    </div>
  );
};
