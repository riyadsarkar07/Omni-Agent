'use client';

import React, { useState } from 'react';
import {
  Terminal,
  BookOpen,
  Copy,
  Check,
  Play,
  Layers,
  Sparkles,
  Code2,
} from 'lucide-react';
const DEMO_PRESET_KEY = 'ua_live_demo_development_key_2026';

export const DocsView: React.FC = () => {
  const [activeLang, setActiveLang] = useState<'sdk' | 'curl' | 'fetch' | 'python'>('sdk');
  const [copied, setCopied] = useState<string | null>(null);

  // Live test runner state
  const [testEndpoint, setTestEndpoint] = useState<string>('/api/v1/chat');
  const [testPayload, setTestPayload] = useState<string>(
    JSON.stringify(
      {
        message: 'Hello OmniAgent! Calculate 150 * 24 and explain the result.',
        thinkingLevel: 'HIGH',
      },
      null,
      2
    )
  );
  const [testResponse, setTestResponse] = useState<string>('');
  const [isTesting, setIsTesting] = useState(false);

  const copyCode = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleRunLiveTest = async () => {
    setIsTesting(true);
    setTestResponse('Executing request against ' + testEndpoint + '...');
    try {
      let body: any = undefined;
      if (testEndpoint === '/api/v1/chat') {
        body = JSON.parse(testPayload);
      }
      const res = await fetch(testEndpoint, {
        method: testEndpoint === '/api/v1/chat' ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEMO_PRESET_KEY}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();
      setTestResponse(JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      setTestResponse('Error: ' + (err as Error).message);
    } finally {
      setIsTesting(false);
    }
  };

  const codeSnippets = {
    sdk: `import { UniversalAgent } from "@/lib/sdk/universal-agent";

// 1. Initialize with your base URL and API key
const agent = new UniversalAgent({
  baseURL: "https://your-domain.vercel.app/api/v1",
  apiKey: process.env.OMNI_API_KEY!,
});

// 2. Chat with reasoning mode
const response = await agent.chat({
  message: "Explain the architecture of distributed transactions in microservices.",
  thinkingLevel: "HIGH" // Triggers ThinkingLevel.HIGH on gemini-3.1-pro-preview
});

console.log(response.message);
console.log("Latency:", response.usage.latencyMs, "ms");`,

    curl: `# Send a message with High Thinking mode
curl -X POST https://your-domain.vercel.app/api/v1/chat \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${DEMO_PRESET_KEY}" \\
  -d '{
    "message": "Calculate (450 * 12) + 350 and get the current UTC date",
    "thinkingLevel": "HIGH"
  }'

# Stream tokens via Server-Sent Events (SSE)
curl -N -X POST https://your-domain.vercel.app/api/v1/chat/stream \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${DEMO_PRESET_KEY}" \\
  -d '{"message": "Write a short poem about clean code."}'`,

    fetch: `// Standard JavaScript Fetch Request
const response = await fetch("https://your-domain.vercel.app/api/v1/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${DEMO_PRESET_KEY}",
  },
  body: JSON.stringify({
    message: "Summarize quantum computing principles in 3 bullet points.",
    overrideModel: "gemini-3.5-flash"
  }),
});

const data = await response.json();
console.log("Agent response:", data.message);`,

    python: `import requests
import json

url = "https://your-domain.vercel.app/api/v1/chat"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${DEMO_PRESET_KEY}"
}
payload = {
    "message": "Analyze system requirements for high throughput chat API.",
    "thinkingLevel": "HIGH"
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()
print("Model Output:", data["message"])`,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">API & SDK Integration Guide</h2>
        <p className="text-xs text-slate-400">
          Connect your external applications (websites, mobile backends, SaaS) to your AI agent platform.
        </p>
      </div>

      {/* Code Snippets & Language Switcher */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {(['sdk', 'curl', 'fetch', 'python'] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setActiveLang(lang)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-all cursor-pointer ${
                  activeLang === lang
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          <button
            onClick={() => copyCode(codeSnippets[activeLang], activeLang)}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {copied === activeLang ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied === activeLang ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <div className="p-4 bg-slate-950 font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed">
          <pre>{codeSnippets[activeLang]}</pre>
        </div>
      </div>

      {/* Interactive "Try Endpoint" Test Runner */}
      <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-white flex items-center gap-2">
            <Play className="w-4 h-4 text-cyan-400" />
            Live Endpoint Test Runner
          </h3>
          <span className="text-[11px] text-slate-400">Authenticated via Demo Key</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Endpoint</label>
              <select
                value={testEndpoint}
                onChange={(e) => setTestEndpoint(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="/api/v1/chat">POST /api/v1/chat (Unary Chat)</option>
                <option value="/api/v1/agents">GET /api/v1/agents (List Agents)</option>
                <option value="/api/v1/health">GET /api/v1/health (Service Health)</option>
              </select>
            </div>

            {testEndpoint === '/api/v1/chat' && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-400">Request Body (JSON)</label>
                <textarea
                  rows={6}
                  value={testPayload}
                  onChange={(e) => setTestPayload(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            )}

            <button
              onClick={handleRunLiveTest}
              disabled={isTesting}
              className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-40 cursor-pointer shadow-md shadow-cyan-500/20"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {isTesting ? 'Sending Request...' : 'Execute Request'}
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400">Response Payload</label>
            <div className="h-[220px] bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300 overflow-y-auto whitespace-pre-wrap">
              {testResponse || 'Click "Execute Request" above to test the REST API live.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
