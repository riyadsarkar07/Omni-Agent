'use client';

import React, { useState, useEffect } from 'react';
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
  Sparkles,
  Search,
} from 'lucide-react';
import { AIProvider, ProviderCapability, ProviderProtocol, ConnectionStatus } from '@/lib/providers/types';

const PROTOCOLS: { value: ProviderProtocol; label: string; defaultUrl: string }[] = [
  { value: 'gemini', label: 'Google Gemini', defaultUrl: 'https://generativelanguage.googleapis.com' },
  { value: 'openai', label: 'OpenAI Compatible', defaultUrl: 'https://api.openai.com/v1' },
  { value: 'anthropic', label: 'Anthropic Compatible', defaultUrl: 'https://api.anthropic.com/v1' },
  { value: 'custom', label: 'Custom HTTP Endpoint', defaultUrl: 'https://' },
];

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

export const ProvidersView: React.FC = () => {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog / Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<AIProvider | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [id, setId] = useState('');
  const [protocol, setProtocol] = useState<ProviderProtocol>('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [modelsInput, setModelsInput] = useState('');
  const [selectedCapabilities, setSelectedCapabilities] = useState<ProviderCapability[]>(['TEXT', 'STREAMING']);
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Testing states
  const [testingId, setTestingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  
  // Status Messages
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/v1/providers');
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
        const res = await fetch('/api/v1/providers');
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
    return () => {
      ignore = true;
    };
  }, []);

  const handleOpenAdd = () => {
    setEditingProvider(null);
    setName('');
    setId('');
    setProtocol('openai');
    setBaseUrl('https://api.openai.com/v1');
    setApiKey('');
    setDefaultModel('gpt-4o-mini');
    setModelsInput('gpt-4o, gpt-4o-mini, o1-mini');
    setSelectedCapabilities(['TEXT', 'STREAMING', 'STRUCTURED_OUTPUT']);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (provider: AIProvider) => {
    setEditingProvider(provider);
    setName(provider.name);
    setId(provider.id);
    setProtocol(provider.protocol);
    setBaseUrl(provider.baseUrl);
    setApiKey(''); // Do not load password into memory for safety
    setDefaultModel(provider.defaultModel);
    setModelsInput(provider.models.join(', '));
    setSelectedCapabilities(provider.capabilities);
    setIsModalOpen(true);
  };

  const handleProtocolChange = (p: ProviderProtocol) => {
    setProtocol(p);
    const matched = PROTOCOLS.find((item) => item.value === p);
    if (matched) {
      setBaseUrl(matched.defaultUrl);
    }
    if (p === 'gemini') {
      setDefaultModel('gemini-3.8-flash');
      setModelsInput('gemini-3.8-flash, gemini-3.1-pro-preview, gemini-3.1-flash-lite, gemini-flash-latest');
      setSelectedCapabilities(['TEXT', 'VISION', 'STREAMING', 'TOOL_CALLING', 'FUNCTION_CALLING', 'TRANSCRIPTION', 'VIDEO_GENERATION', 'MUSIC_GENERATION']);
    } else if (p === 'anthropic') {
      setDefaultModel('claude-3-5-haiku-latest');
      setModelsInput('claude-3-5-sonnet-latest, claude-3-5-haiku-latest, claude-3-opus-latest');
      setSelectedCapabilities(['TEXT', 'VISION', 'STREAMING', 'STRUCTURED_OUTPUT']);
    } else if (p === 'openai') {
      setDefaultModel('gpt-4o-mini');
      setModelsInput('gpt-4o, gpt-4o-mini, o1-mini');
      setSelectedCapabilities(['TEXT', 'VISION', 'STREAMING', 'TOOL_CALLING', 'FUNCTION_CALLING', 'STRUCTURED_OUTPUT']);
    }
  };

  const toggleCapability = (cap: ProviderCapability) => {
    if (selectedCapabilities.includes(cap)) {
      setSelectedCapabilities(selectedCapabilities.filter((c) => c !== cap));
    } else {
      setSelectedCapabilities([...selectedCapabilities, cap]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const modelsList = modelsInput
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    const payload: any = {
      id: id.trim().toLowerCase(),
      name: name.trim(),
      protocol,
      baseUrl: baseUrl.trim(),
      defaultModel: defaultModel.trim(),
      models: modelsList,
      capabilities: selectedCapabilities,
    };

    if (apiKey.trim()) {
      payload.apiKey = apiKey.trim();
    }

    try {
      const url = editingProvider ? `/api/v1/providers/${editingProvider.id}` : '/api/v1/providers';
      const method = editingProvider ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg(`Provider "${name}" saved successfully.`);
        setIsModalOpen(false);
        fetchProviders();
      } else {
        setErrorMsg(data.error || 'Failed to save provider.');
      }
    } catch {
      setErrorMsg('An error occurred while saving the provider.');
    }
  };

  const toggleEnable = async (provider: AIProvider) => {
    try {
      const res = await fetch(`/api/v1/providers/${provider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !provider.enabled }),
      });
      if (res.ok) {
        setProviders(
          providers.map((p) => (p.id === provider.id ? { ...p, enabled: !provider.enabled } : p))
        );
        showNotification(`Provider "${provider.name}" ${!provider.enabled ? 'enabled' : 'disabled'}.`);
      }
    } catch {
      setErrorMsg('Failed to change provider status.');
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/v1/providers/${id}/test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification(`Provider tested successfully! Response latency: ${data.latencyMs}ms.`, 'success');
      } else {
        showNotification(`Testing failed: ${data.error || 'Check configurations'}`, 'error');
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
      const res = await fetch(`/api/v1/providers/${id}/models`);
      const data = await res.json();
      if (data.success && data.models) {
        showNotification(`Discovered ${data.models.length} active models dynamically!`, 'success');
      } else {
        showNotification('Dynamic model discovery failed. Check endpoints or key.', 'error');
      }
      fetchProviders();
    } catch {
      showNotification('Model discovery endpoint request failed.', 'error');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (provider: AIProvider) => {
    if (!confirm(`Are you absolutely sure you want to delete "${provider.name}"?\nThis will not delete unrelated projects or usage data.`)) return;
    try {
      const res = await fetch(`/api/v1/providers/${provider.id}`, { method: 'DELETE' });
      if (res.ok) {
        setProviders(providers.filter((p) => p.id !== provider.id));
        showNotification(`Provider "${provider.name}" deleted.`, 'success');
      }
    } catch {
      showNotification('Failed to delete provider.', 'error');
    }
  };

  const showNotification = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3500);
    } else if (type === 'error') {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 4500);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 3000);
    }
  };

  const filteredProviders = providers.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.protocol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-cyan-400" />
            AI Provider Registry
          </h2>
          <p className="text-xs text-zinc-400">
            Configure multi-provider routing adapters, dynamic model discovery, and resilient failover logic.
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

      {/* Global Toast Messages */}
      <AnimatePresence>
        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs flex items-center gap-2.5 font-medium shadow-sm"
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
            className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-xs flex items-center gap-2.5 font-medium shadow-sm"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter and search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search registered providers by name, protocol, or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
        />
      </div>

      {/* Providers Grid / Table */}
      {isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-xs text-zinc-400 font-medium">Resolving provider adapter configurations...</p>
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/20 p-12 text-center">
          <Server className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-zinc-300">No Providers Found</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
            There are no providers matching your filter. Add a new OpenAI, Anthropic, or Custom gateway to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredProviders.map((provider) => {
            const isGemini = provider.protocol === 'gemini';
            return (
              <motion.div
                key={provider.id}
                layoutId={`provider-card-${provider.id}`}
                className={`glass-card rounded-2xl p-6 border border-white/5 overflow-hidden transition-all duration-200 ${
                  provider.enabled
                    ? ''
                    : 'opacity-60'
                }`}
              >
                {/* Provider content ... */}

                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/5 bg-white/[0.02] p-5">
                  <div className="flex items-start gap-3.5">
                    <div className={`p-2.5 rounded-lg border ${
                      provider.enabled
                        ? 'bg-zinc-900 border-white/10 text-cyan-400'
                        : 'bg-zinc-900 border-white/5 text-zinc-500'
                    }`}>
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-white">{provider.name}</h3>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-zinc-900 text-zinc-400 border border-white/5">
                          {provider.protocol}
                        </span>
                        {!provider.enabled && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Disabled
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-zinc-400 font-mono mt-1 select-all">{provider.baseUrl}</p>
                    </div>
                  </div>

                  {/* Operational parameters */}
                  <div className="flex items-center gap-3">
                    {/* Status Badge */}
                    <div className="text-right hidden sm:block">
                      <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Connection Status</div>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold mt-1 px-2.5 py-0.5 rounded-full border ${
                        provider.connectionStatus === 'Connected'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : provider.connectionStatus === 'Untested'
                          ? 'text-zinc-400 bg-zinc-900 border-white/5'
                          : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
                      }`}>
                        {provider.connectionStatus === 'Connected' && <Wifi className="w-3 h-3 animate-pulse" />}
                        {provider.connectionStatus}
                      </span>
                    </div>

                    {/* Latency display */}
                    {provider.latencyMs && (
                      <div className="text-right hidden sm:block border-l border-white/5 pl-4">
                        <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Latency</div>
                        <div className="text-xs font-semibold text-zinc-200 mt-0.5 flex items-center justify-end gap-1">
                          <Activity className="w-3 h-3 text-cyan-400" />
                          {provider.latencyMs}ms
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sub-body Details */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-12 gap-5">
                  {/* Left part: models and info */}
                  <div className="md:col-span-8 space-y-4">
                    {/* Default model and capabilities */}
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                      <div>
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Default Model</span>
                        <code className="text-xs font-bold text-zinc-200 block mt-0.5 font-mono">{provider.defaultModel}</code>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">API Key Status</span>
                        <div className="text-xs font-medium text-zinc-300 mt-0.5 flex items-center gap-1">
                          <Lock className="w-3.5 h-3.5 text-zinc-400" />
                          {provider.hasApiKey ? (
                            <span className="text-emerald-400 font-semibold">Securely Stored</span>
                          ) : (
                            <span className="text-zinc-500">No Key Configured</span>
                          )}
                        </div>
                      </div>

                      {provider.lastTested && (
                        <div>
                          <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Last Tested</span>
                          <span className="text-xs text-zinc-400 block mt-0.5">{new Date(provider.lastTested).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Available Models List */}
                    <div>
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5">Configured Models ({provider.models.length})</span>
                      <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                        {provider.models.map((m) => (
                          <span
                            key={m}
                            className="text-[10px] font-medium font-mono px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-white/5"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Capabilities Badges */}
                    <div>
                      <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-1.5">Capabilities</span>
                      <div className="flex flex-wrap gap-1">
                        {provider.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="text-[9px] font-bold px-2 py-0.5 rounded bg-cyan-500/5 text-cyan-300 border border-cyan-500/10 uppercase"
                          >
                            {cap.replace('_', ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right part: stats and action panel */}
                  <div className="md:col-span-4 rounded-xl bg-zinc-900/30 border border-white/5 p-4 flex flex-col justify-between gap-4">
                    {/* Tiny Analytics Summary */}
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-zinc-950 rounded-lg p-2 border border-white/5">
                        <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Usage</div>
                        <div className="text-sm font-bold text-zinc-200 mt-0.5">{provider.usageCount || 0} reqs</div>
                      </div>
                      <div className="bg-zinc-950 rounded-lg p-2 border border-white/5">
                        <div className="text-[9px] text-zinc-500 uppercase tracking-wider">Error Rate</div>
                        <div className="text-sm font-bold text-zinc-200 mt-0.5">{(provider.errorRate || 0) * 100}%</div>
                      </div>
                    </div>

                    {/* Actions Panel */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                      <button
                        onClick={() => handleTestConnection(provider.id)}
                        disabled={testingId === provider.id}
                        className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Wifi className={`w-3.5 h-3.5 ${testingId === provider.id ? 'animate-pulse text-cyan-400' : ''}`} />
                        {testingId === provider.id ? 'Testing...' : 'Test Connection'}
                      </button>

                      <button
                        onClick={() => handleRefreshModels(provider.id)}
                        disabled={refreshingId === provider.id || isGemini}
                        className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title={isGemini ? "Gemini models lists are static" : "Dynamic discovery models"}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === provider.id ? 'animate-spin' : ''}`} />
                        {refreshingId === provider.id ? 'Discovering...' : 'Discover Models'}
                      </button>

                      <button
                        onClick={() => toggleEnable(provider)}
                        className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          provider.enabled
                            ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20'
                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        {provider.enabled ? 'Disable' : 'Enable'}
                      </button>

                      <div className="flex gap-1">
                        <button
                          onClick={() => handleOpenEdit(provider)}
                          className="flex-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded-lg flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>

                        {!isGemini && (
                          <button
                            onClick={() => handleDelete(provider)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                            title="Delete configuration"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Provider Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-zinc-950 border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-cyan-400" />
                {editingProvider ? 'Edit Provider Integration' : 'Register AI Provider Gateway'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-white transition cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* ID - unique key */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Provider ID</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingProvider)}
                    placeholder="openai-gateway"
                    value={id}
                    onChange={(e) => setId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                  />
                  <span className="text-[10px] text-zinc-500">Unique identifier, lowercase without spaces.</span>
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Provider Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="My Custom Provider Gateway"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Protocol */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">API Protocol</label>
                  <select
                    disabled={editingProvider?.id === 'gemini'}
                    value={protocol}
                    onChange={(e) => handleProtocolChange(e.target.value as ProviderProtocol)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 cursor-pointer disabled:opacity-50"
                  >
                    {PROTOCOLS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Base URL */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Base Connection URL</label>
                  <input
                    type="url"
                    required
                    disabled={editingProvider?.id === 'gemini'}
                    placeholder="https://api.openai.com/v1"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                  />
                </div>
              </div>

              {/* API Key / Credential */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">
                  API Key / Secret Credential
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={editingProvider?.hasApiKey ? '•••••••••••••••• (Unchanged unless overwritten)' : 'Enter secure API secret key...'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[10px] text-zinc-500">Credentials are securely kept on the server and are never revealed to client components.</span>
              </div>

              {/* Models Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Default Model ID</label>
                  <input
                    type="text"
                    required
                    placeholder="gpt-4o-mini"
                    value={defaultModel}
                    onChange={(e) => setDefaultModel(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block">Available Model List</label>
                  <input
                    type="text"
                    required
                    placeholder="gpt-4o, gpt-4o-mini, o1-mini"
                    value={modelsInput}
                    onChange={(e) => setModelsInput(e.target.value)}
                    className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <span className="text-[10px] text-zinc-500">Comma-separated lists of model identifiers.</span>
                </div>
              </div>

              {/* Capabilities Checkboxes */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest block mb-2">Supported Capabilities</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {CAPABILITIES.map((cap) => {
                    const isChecked = selectedCapabilities.includes(cap.value);
                    return (
                      <button
                        type="button"
                        key={cap.value}
                        onClick={() => toggleCapability(cap.value)}
                        className={`flex items-start text-left gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                          isChecked
                            ? 'bg-cyan-500/5 border-cyan-500/20 text-zinc-200'
                            : 'bg-zinc-950/20 border-white/5 text-zinc-400 hover:border-white/10'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border transition-colors ${
                          isChecked ? 'bg-cyan-500 border-cyan-500 text-zinc-950' : 'border-zinc-700'
                        }`}>
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

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold text-xs rounded-lg cursor-pointer shadow-lg shadow-cyan-500/15"
                >
                  Save Integration
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};
