'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Server,
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Wifi,
  Power,
  Check,
  Lock,
  Eye,
  EyeOff,
  Sliders,
  Search,
  Star,
  ChevronDown,
  X,
} from 'lucide-react';
import { AIProvider, ProviderCapability, ProviderKind, ConnectionStatus } from '@/lib/providers/types';
import { PROVIDER_TYPE_OPTIONS } from '@/lib/providers/catalog';
import { apiFetch } from '@/lib/auth/session-client';

const CAPABILITIES: { value: ProviderCapability; label: string; description: string }[] = [
  { value: 'TEXT', label: 'Text Generation', description: 'Core natural language completion' },
  { value: 'VISION', label: 'Vision / Multimodal', description: 'Analyze images and file attachments' },
  { value: 'STREAMING', label: 'Streaming', description: 'Low-latency server-sent events (SSE)' },
  { value: 'TOOL_CALLING', label: 'Tool Calling', description: 'Natively invoke custom external tools' },
  { value: 'STRUCTURED_OUTPUT', label: 'Structured JSON', description: 'Enforce strict schema conformance' },
  { value: 'TRANSCRIPTION', label: 'Transcription', description: 'Speech-to-text audio processing' },
  { value: 'VIDEO_GENERATION', label: 'Video Generation', description: 'Create dynamic video animations' },
  { value: 'MUSIC_GENERATION', label: 'Music Generation', description: 'Create rich background audio/tracks' },
];

interface HeaderPair {
  key: string;
  value: string;
}

interface TestResult {
  success: boolean;
  reachable?: boolean;
  authenticated?: boolean;
  modelAvailable?: boolean;
  error?: string | null;
  latencyMs?: number | null;
}

function parseHeaders(pairs: HeaderPair[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const key = pair.key.trim();
    if (!key) continue;
    out[key] = pair.value;
  }
  return out;
}

export const ProvidersView: React.FC = () => {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [type, setType] = useState<ProviderKind>('openai-compatible');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [modelId, setModelId] = useState('');
  const [manualModel, setManualModel] = useState(true);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [selectedCapabilities, setSelectedCapabilities] = useState<ProviderCapability[]>(['TEXT', 'STREAMING']);
  const [showApiKey, setShowApiKey] = useState(false);
  const [organizationId, setOrganizationId] = useState('');
  const [apiVersion, setApiVersion] = useState('');
  const [requestTimeoutMs, setRequestTimeoutMs] = useState(20000);
  const [maxRetries, setMaxRetries] = useState(1);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
  const [customHeaders, setCustomHeaders] = useState<HeaderPair[]>([{ key: '', value: '' }]);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingDraft, setTestingDraft] = useState(false);
  const [draftTest, setDraftTest] = useState<TestResult | null>(null);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedType = PROVIDER_TYPE_OPTIONS.find((item) => item.id === type) || PROVIDER_TYPE_OPTIONS[3];

  const fetchProviders = async () => {
    try {
        const res = await apiFetch('/api/v1/providers');
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers || []);
      }
    } catch {
      setErrorMsg('Failed to load AI providers.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await apiFetch('/api/v1/providers');
        if (res.ok && !ignore) {
          const data = await res.json();
          setProviders(data.providers || []);
        }
      } catch {
        if (!ignore) setErrorMsg('Failed to load AI providers.');
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    load();
    const onFocus = () => {
      if (!ignore) fetchProviders();
    };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(() => {
      if (!ignore) fetchProviders();
    }, 12000);
    return () => {
      ignore = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, []);

  const resetForm = (kind: ProviderKind = 'openai-compatible') => {
    const option = PROVIDER_TYPE_OPTIONS.find((item) => item.id === kind) || PROVIDER_TYPE_OPTIONS[3];
    setType(kind);
    setName('');
    setBaseUrl('');
    setApiKey('');
    setModelId('');
    setManualModel(true);
    setDiscoveredModels([]);
    setSelectedCapabilities(option.defaultCapabilities);
    setOrganizationId('');
    setApiVersion('');
    setRequestTimeoutMs(20000);
    setMaxRetries(1);
    setTemperature(0.7);
    setMaxTokens(2048);
    setStreamingEnabled(true);
    setCustomHeaders([{ key: '', value: '' }]);
    setShowAdvanced(false);
    setDraftTest(null);
    setShowApiKey(false);
  };

  const handleOpenAdd = () => {
    setEditingProvider(null);
    resetForm('openai-compatible');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (provider: AIProvider) => {
    setEditingProvider(provider);
    setType(provider.type || 'openai-compatible');
    setName(provider.name);
    setBaseUrl(provider.baseUrl || '');
    setApiKey('');
    setModelId(provider.defaultModel || '');
    setDiscoveredModels(provider.models || []);
    setManualModel(!(provider.models && provider.models.length > 0));
    setSelectedCapabilities(provider.capabilities?.length ? provider.capabilities : ['TEXT', 'STREAMING']);
    setOrganizationId(provider.metadata?.organizationId || '');
    setApiVersion(provider.metadata?.apiVersion || '');
    setRequestTimeoutMs(provider.metadata?.requestTimeoutMs || 20000);
    setMaxRetries(provider.metadata?.maxRetries ?? 1);
    setTemperature(provider.metadata?.temperature ?? 0.7);
    setMaxTokens(provider.metadata?.maxTokens || 2048);
    setStreamingEnabled(provider.metadata?.streamingEnabled !== false);
    const headers = Object.entries(provider.metadata?.customHeaders || {}).map(([key, value]) => ({ key, value }));
    setCustomHeaders(headers.length ? headers : [{ key: '', value: '' }]);
    setShowAdvanced(Boolean(provider.metadata?.organizationId || provider.metadata?.customHeaders));
    setDraftTest(null);
    setIsModalOpen(true);
  };

  const handleTypeChange = (next: ProviderKind) => {
    const option = PROVIDER_TYPE_OPTIONS.find((item) => item.id === next) || PROVIDER_TYPE_OPTIONS[3];
    setType(next);
    setSelectedCapabilities(option.defaultCapabilities);
    setDiscoveredModels([]);
    setDraftTest(null);
  };

  const buildPayload = () => {
    const headers = parseHeaders(customHeaders);
    return {
      name: name.trim(),
      type,
      protocol: selectedType.protocol,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim() || undefined,
      model: modelId.trim(),
      defaultModel: modelId.trim(),
      models: discoveredModels.length ? discoveredModels : modelId.trim() ? [modelId.trim()] : [],
      capabilities: selectedCapabilities,
      organizationId: organizationId.trim() || undefined,
      apiVersion: apiVersion.trim() || undefined,
      customHeaders: Object.keys(headers).length ? headers : undefined,
      requestTimeoutMs,
      maxRetries,
      temperature,
      maxTokens,
      streamingEnabled,
    };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!name.trim()) {
      setErrorMsg('Provider name is required.');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      const url = editingProvider ? `/api/v1/providers/${editingProvider.id}` : '/api/v1/providers';
      const method = editingProvider ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSuccessMsg(`Provider "${name}" saved successfully.`);
        setIsModalOpen(false);
        fetchProviders();
      } else {
        setErrorMsg(data.error || data.message || `Failed to save provider (${res.status}).`);
      }
    } catch {
      setErrorMsg('An error occurred while saving the provider.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestDraft = async () => {
    setTestingDraft(true);
    setDraftTest(null);
    try {
      const res = await apiFetch('/api/v1/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildPayload(),
          id: editingProvider?.id,
        }),
      });
      const data = await res.json();
      setDraftTest({
        success: Boolean(data.success),
        reachable: data.reachable,
        authenticated: data.authenticated,
        modelAvailable: data.modelAvailable,
        error: data.error,
        latencyMs: data.latencyMs,
      });
      if (Array.isArray(data.models) && data.models.length > 0) {
        setDiscoveredModels(data.models);
        setManualModel(false);
        if (!modelId && data.models[0]) setModelId(data.models[0]);
      }
    } catch {
      setDraftTest({ success: false, error: 'Unable to contact test endpoint.' });
    } finally {
      setTestingDraft(false);
    }
  };

  const toggleEnable = async (provider: AIProvider) => {
    try {
      const res = await apiFetch(`/api/v1/providers/${provider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !provider.enabled }),
      });
      if (res.ok) {
        setProviders(providers.map((p) => (p.id === provider.id ? { ...p, enabled: !provider.enabled } : p)));
        showNotification(`Provider "${provider.name}" ${!provider.enabled ? 'enabled' : 'disabled'}.`);
      }
    } catch {
      setErrorMsg('Failed to change provider status.');
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    try {
      const res = await apiFetch(`/api/v1/providers/${id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification(`Connection successful. Latency ${data.latencyMs}ms.`, 'success');
      } else {
        showNotification(`Connection failed: ${data.error || 'Check configuration'}`, 'error');
      }
      fetchProviders();
    } catch {
      showNotification('Unable to contact test endpoint.', 'error');
    } finally {
      setTestingId(null);
    }
  };

  const handleRefreshModels = async (id: string) => {
    setRefreshingId(id);
    try {
      const res = await apiFetch(`/api/v1/providers/${id}/models`);
      const data = await res.json();
      if (data.success && data.models?.length) {
        showNotification(`Discovered ${data.models.length} models.`, 'success');
      } else {
        showNotification('Model discovery unavailable. Enter a Model ID manually.', 'error');
      }
      fetchProviders();
    } catch {
      showNotification('Model discovery request failed.', 'error');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await apiFetch(`/api/v1/providers/${id}/default`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('Default provider updated.', 'success');
        fetchProviders();
      } else {
        showNotification(data.error || 'Failed to set default provider.', 'error');
      }
    } catch {
      showNotification('Failed to set default provider.', 'error');
    }
  };

  const handleDelete = async (provider: AIProvider) => {
    if (!confirm(`Delete "${provider.name}"? This will not delete unrelated projects or usage data.`)) return;
    try {
      const res = await apiFetch(`/api/v1/providers/${provider.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success !== false) {
        setProviders((prev) => prev.filter((p) => p.id !== provider.id));
        showNotification(`Provider "${provider.name}" deleted.`, 'success');
      } else {
        showNotification(data.error || 'Failed to delete provider.', 'error');
      }
    } catch {
      showNotification('Failed to delete provider.', 'error');
    }
  };

  const showNotification = (msg: string, kind: 'success' | 'error' | 'info' = 'info') => {
    if (kind === 'error') {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4500);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3500);
    }
  };

  const toggleCapability = (cap: ProviderCapability) => {
    setSelectedCapabilities((prev) => (prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]));
  };

  const filteredProviders = useMemo(
    () =>
      providers.filter(
        (p) =>
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.type || p.protocol).toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [providers, searchQuery]
  );

  const statusClass = (status: ConnectionStatus) => {
    if (status === 'Connected') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    if (status === 'Untested') return 'text-zinc-400 bg-zinc-900 border-white/5';
    return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-cyan-400" />
            API Configuration
          </h2>
          <p className="text-xs text-zinc-400">
            Add unlimited third-party APIs (OpenRouter, Groq, Together, local). Saved providers sync across phone and laptop.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-cyan-500/15"
        >
          <Plus className="w-4 h-4" />
          Add API Provider
        </button>
      </div>

      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs flex items-center gap-2.5 font-medium"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </motion.div>
        )}
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs flex items-center gap-2.5 font-medium"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search providers by name, type, or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
      </div>

      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-xs text-zinc-400 font-medium">Loading provider configurations...</p>
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/20 p-12 text-center">
          <Server className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-zinc-300">No Providers Found</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
            Add an OpenAI-compatible, Anthropic, Gemini, or custom HTTP provider to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProviders.map((provider) => (
            <motion.div
              key={provider.id}
              layoutId={`provider-card-${provider.id}`}
              className={`glass-card rounded-2xl border border-white/5 overflow-hidden ${provider.enabled ? '' : 'opacity-60'}`}
            >
              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm text-white">{provider.name}</h3>
                      {provider.isDefault && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          Default
                        </span>
                      )}
                      {!provider.enabled && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 font-mono">{provider.defaultModel || 'No model selected'}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${statusClass(provider.connectionStatus)}`}>
                    {provider.connectionStatus === 'Connected' && <Wifi className="w-3 h-3" />}
                    {provider.connectionStatus === 'Connected' ? 'Connected' : provider.connectionStatus}
                  </span>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-zinc-400">
                  <div>
                    <span className="uppercase tracking-widest text-zinc-500 block">Type</span>
                    <span className="text-zinc-200">{provider.type || provider.protocol}</span>
                  </div>
                  <div>
                    <span className="uppercase tracking-widest text-zinc-500 block">API Key</span>
                    <span className="text-zinc-200 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      {provider.hasApiKey ? 'Stored' : 'Missing'}
                    </span>
                  </div>
                  {provider.lastTested && (
                    <div>
                      <span className="uppercase tracking-widest text-zinc-500 block">Last tested</span>
                      <span className="text-zinc-200">{new Date(provider.lastTested).toLocaleString()}</span>
                    </div>
                  )}
                  {provider.latencyMs ? (
                    <div>
                      <span className="uppercase tracking-widest text-zinc-500 block">Latency</span>
                      <span className="text-zinc-200 flex items-center gap-1">
                        <Activity className="w-3 h-3 text-cyan-400" />
                        {provider.latencyMs}ms
                      </span>
                    </div>
                  ) : null}
                </div>

                {provider.models?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {provider.models.slice(0, 8).map((m) => (
                      <span key={m} className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-white/5">
                        {m}
                      </span>
                    ))}
                    {provider.models.length > 8 && (
                      <span className="text-[10px] text-zinc-500 px-2 py-0.5">+{provider.models.length - 8}</span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-white/5">
                  <button
                    onClick={() => handleTestConnection(provider.id)}
                    disabled={testingId === provider.id}
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <Wifi className={`w-3.5 h-3.5 ${testingId === provider.id ? 'animate-pulse text-cyan-400' : ''}`} />
                    {testingId === provider.id ? 'Testing...' : 'Test'}
                  </button>
                  <button
                    onClick={() => handleOpenEdit(provider)}
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => toggleEnable(provider)}
                    className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 ${
                      provider.enabled
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    <Power className="w-3.5 h-3.5" />
                    {provider.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleRefreshModels(provider.id)}
                    disabled={refreshingId === provider.id}
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === provider.id ? 'animate-spin' : ''}`} />
                    Models
                  </button>
                  <button
                    onClick={() => handleSetDefault(provider.id)}
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5"
                  >
                    <Star className="w-3.5 h-3.5" />
                    Default
                  </button>
                  {provider.id !== 'gemini' && (
                    <button
                      onClick={() => handleDelete(provider)}
                      className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-950 border border-white/10 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
          >
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                {editingProvider ? 'Edit API Provider' : 'Add API Provider'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">API Provider</label>
                <select
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value as ProviderKind)}
                  disabled={editingProvider?.id === 'gemini'}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 cursor-pointer disabled:opacity-50"
                >
                  {PROVIDER_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Provider Name</label>
                <input
                  type="text"
                  required
                  placeholder="My Local AI"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Base URL</label>
                <input
                  type="url"
                  placeholder={selectedType.placeholderUrl}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={editingProvider?.id === 'gemini'}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                />
                {type === 'openai-compatible' ? (
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Local OmniRoute: http://localhost:20128/v1 (only works when OmniAgent runs on the same computer).
                    Vercel cannot reach localhost on your Windows PC. For production, save a separately configured public HTTPS OmniRoute Base URL. A public address will not be invented.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    autoComplete="off"
                    placeholder={editingProvider?.hasApiKey ? 'Leave blank to keep stored key' : 'Enter API key'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-4 pr-20 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs flex items-center gap-1"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showApiKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                {editingProvider?.hasApiKey && !apiKey.trim() ? (
                  <p className="text-[10px] text-zinc-500">A key is already stored. Paste a new key only if you want to replace it.</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Model ID</label>
                {discoveredModels.length > 0 && !manualModel ? (
                  <div className="space-y-2">
                    <select
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 cursor-pointer font-mono"
                    >
                      {discoveredModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setManualModel(true)} className="text-[10px] text-cyan-400">
                      Enter model ID manually
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="google/gemma-3-27b-it:free"
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                    {discoveredModels.length > 0 && (
                      <button type="button" onClick={() => setManualModel(false)} className="text-[10px] text-cyan-400">
                        Use discovered models
                      </button>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1"
              >
                <ChevronDown className={`w-4 h-4 transition ${showAdvanced ? 'rotate-180' : ''}`} />
                Advanced Settings
              </button>

              {showAdvanced && (
                <div className="space-y-4 rounded-2xl border border-white/5 bg-zinc-900/40 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Organization ID</label>
                      <input value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">API Version</label>
                      <input value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Request Timeout (ms)</label>
                      <input type="number" min={1000} value={requestTimeoutMs} onChange={(e) => setRequestTimeoutMs(Number(e.target.value))} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Max Retries</label>
                      <input type="number" min={0} max={4} value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value))} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Temperature</label>
                      <input type="number" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase">Max Tokens</label>
                      <input type="number" min={1} value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} className="w-full bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
                    </div>
                  </div>
                  <label className="flex items-center justify-between text-sm text-zinc-300">
                    Streaming
                    <input type="checkbox" checked={streamingEnabled} onChange={(e) => setStreamingEnabled(e.target.checked)} className="accent-cyan-500" />
                  </label>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Custom Headers</label>
                    {customHeaders.map((header, idx) => (
                      <div key={idx} className="grid grid-cols-2 gap-2">
                        <input
                          placeholder="Header name"
                          value={header.key}
                          onChange={(e) => {
                            const next = [...customHeaders];
                            next[idx] = { ...next[idx], key: e.target.value };
                            setCustomHeaders(next);
                          }}
                          className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                        <input
                          placeholder="Header value"
                          value={header.value}
                          onChange={(e) => {
                            const next = [...customHeaders];
                            next[idx] = { ...next[idx], value: e.target.value };
                            setCustomHeaders(next);
                          }}
                          className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                        />
                      </div>
                    ))}
                    <button type="button" onClick={() => setCustomHeaders([...customHeaders, { key: '', value: '' }])} className="text-[10px] text-cyan-400">
                      Add header
                    </button>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase block mb-2">Capabilities</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {CAPABILITIES.map((cap) => {
                        const isChecked = selectedCapabilities.includes(cap.value);
                        return (
                          <button
                            type="button"
                            key={cap.value}
                            onClick={() => toggleCapability(cap.value)}
                            className={`flex items-start text-left gap-3 p-3 rounded-xl border ${
                              isChecked ? 'bg-cyan-500/5 border-cyan-500/20 text-zinc-200' : 'bg-zinc-950/20 border-white/5 text-zinc-400'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border ${isChecked ? 'bg-cyan-500 border-cyan-500 text-zinc-950' : 'border-zinc-700'}`}>
                              {isChecked && <Check className="w-3 h-3 stroke-[3px]" />}
                            </div>
                            <div>
                              <div className="text-[11px] font-bold text-white">{cap.label}</div>
                              <div className="text-[9px] text-zinc-500 mt-0.5">{cap.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {draftTest && (
                <div className={`rounded-xl border p-3 text-xs space-y-1 ${draftTest.success ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/20 bg-rose-500/10 text-rose-300'}`}>
                  <div className="font-bold">{draftTest.success ? 'Connection successful' : 'Connection failed'}</div>
                  {draftTest.success ? (
                    <>
                      <div>Provider reachable</div>
                      {draftTest.authenticated !== false ? <div>API key accepted</div> : null}
                      {draftTest.modelAvailable ? <div>Model available</div> : <div>Model not verified — you can still save this provider</div>}
                      {draftTest.error ? <div className="text-amber-300">{draftTest.error}</div> : null}
                    </>
                  ) : (
                    <div>{draftTest.error}</div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleTestDraft}
                  disabled={testingDraft}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold rounded-lg"
                >
                  {testingDraft ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs rounded-lg shadow-lg shadow-cyan-500/15"
                >
                  {saving ? 'Saving...' : 'Save Provider'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
