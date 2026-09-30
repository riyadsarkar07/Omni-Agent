# OmniAgent AI Platform

A production-ready, centralized **Universal AI Agent Platform** powered by the **Google Gemini API** (`@google/genai`) and Next.js App Router.

Deploy your custom AI agents once and consume them securely across multiple external websites, mobile apps, SaaS applications, and customer support backends through a unified REST API and official TypeScript SDK.

---

## 🌟 Key Features

* **Universal REST API**: Versioned endpoints (`/api/v1/chat`, `/api/v1/chat/stream`, `/api/v1/agents`, `/api/v1/conversations`, `/api/v1/api-keys`, `/api/v1/usage`, `/api/v1/health`).
* **Google Gemini 3 Series Models**:
  * `gemini-3.5-flash`: Balanced speed and high intelligence for general tasks.
  * `gemini-3.1-pro-preview`: Deep reasoning with `ThinkingLevel.HIGH` for complex logic, math, and code.
  * `gemini-3.1-flash-lite`: Sub-second latency for real-time streaming and high-volume traffic.
  * `gemini-3.8-flash`: Fast versatile general model.
* **Multi-Project Isolation**: Strict project boundaries; keys, conversations, and usage logs never leak across projects.
* **API Key Management**: Cryptographically secure keys (`ua_live_...`, `ua_test_...`), salted SHA-256 storage, one-time reveal, per-key rate limits, and instant revocation.
* **Server-Sent Events (SSE) Streaming**: Real-time token streaming with sub-millisecond dispatch.
* **Extensible Tool Registry**: Built-in function calling declarations for math calculations, timezone clocks, knowledge search, and UUID generation with safe sandbox execution.
* **Database Architecture**: Full Supabase PostgreSQL schema with 10 tables, triggers, and Row Level Security (RLS) policies, plus a resilient fallback storage engine for zero-setup previews.
* **Professional Admin Dashboard**: Dark-mode-first aesthetic with Overview, Projects, Agents editor, interactive Playground with live streaming and thinking mode toggles, API Keys manager, Conversation history, Usage Analytics, Interactive Docs, and Settings.
* **Reusable TypeScript SDK**: Client package (`UniversalAgent`) for seamless server-side integration.

---

## 🚀 Quick Start

### 1. Clone & Install
```bash
git clone https://github.com/your-username/omniagent-ai-platform.git
cd omniagent-ai-platform
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env.local` and add your Gemini API Key:
```env
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-3.5-flash"
NEXT_PUBLIC_SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""
```

### 3. Run Locally
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the Admin Dashboard and Playground.

---

## 📚 Documentation Index

* [Installation Guide](./INSTALLATION.md)
* [Vercel & GitHub Deployment Guide](./DEPLOYMENT.md)
* [REST API Documentation & Endpoints](./API_DOCUMENTATION.md)
* [TypeScript SDK Usage Guide](./SDK_USAGE.md)
* [Security & Threat Model](./SECURITY.md)
* [Contributing Guidelines](./CONTRIBUTING.md)

---

## 📦 SDK Quick Example

```typescript
import { UniversalAgent } from "@/lib/sdk/universal-agent";

const agent = new UniversalAgent({
  baseURL: "https://your-domain.vercel.app/api/v1",
  apiKey: process.env.OMNI_API_KEY!,
});

// Unary Chat
const response = await agent.chat({
  message: "Explain the architecture of distributed transactions in microservices.",
  thinkingLevel: "HIGH" // Triggers ThinkingLevel.HIGH on gemini-3.1-pro-preview
});

console.log(response.message);

// Streaming Chat
for await (const chunk of agent.chatStream({ message: "Write a quick poem." })) {
  if (chunk.type === "chunk") {
    process.stdout.write(chunk.text || "");
  }
}
```

---

## 📄 License
MIT © 2026 OmniAgent Team.
