# TypeScript & JavaScript SDK Usage Guide

The OmniAgent SDK (`UniversalAgent`) enables external Node.js, Next.js, Express, Bun, or Cloudflare Worker applications to connect to your centralized AI Agent engine.

---

## Installation

Inside your external application:

```bash
# Direct import from lib or install from your npm package:
npm install @your-org/agent-sdk
```

---

## Basic Usage

```typescript
import { UniversalAgent } from "@/lib/sdk/universal-agent";

// 1. Initialize client with base URL and API key
const agent = new UniversalAgent({
  baseURL: process.env.OMNI_AGENT_URL || "https://your-domain.vercel.app/api/v1",
  apiKey: process.env.OMNI_API_KEY!,
});

async function run() {
  // 2. Chat with the agent
  const response = await agent.chat({
    message: "What are the latest best practices for PostgreSQL connection pooling?",
  });

  console.log("Agent Reply:", response.message);
  console.log("Conversation ID:", response.conversationId);
  console.log("Total Tokens:", response.usage.totalTokens);
}

run();
```

---

## Multi-Turn Conversations

To maintain conversational state across turns, pass the returned `conversationId`:

```typescript
// Turn 1
const turn1 = await agent.chat({
  message: "Remember that my favourite programming language is Rust.",
});

// Turn 2: references previous context
const turn2 = await agent.chat({
  message: "What is my favourite programming language?",
  conversationId: turn1.conversationId,
});

console.log(turn2.message); // "Your favourite programming language is Rust!"
```

---

## High Thinking Mode (`ThinkingLevel.HIGH`)

When working with complex reasoning, coding architectures, or algorithmic queries:

```typescript
const response = await agent.chat({
  message: "Audit this smart contract code and find all re-entrancy vectors.",
  overrideModel: "gemini-3.1-pro-preview",
  thinkingLevel: "HIGH",
});
```

---

## Real-Time Streaming Responses

```typescript
async function streamAnswer() {
  const stream = agent.chatStream({
    message: "Write a comprehensive guide on building scalable WebSocket backends.",
  });

  for await (const chunk of stream) {
    if (chunk.type === "chunk") {
      process.stdout.write(chunk.text || "");
    } else if (chunk.type === "done") {
      console.log(`\nCompleted in ${chunk.usage?.latencyMs}ms`);
    }
  }
}
```

---

## Security Best Practice for Browser-Based Apps

> **CRITICAL**: Never expose private API keys (`ua_live_...`) directly in client-side browser bundles or public mobile app builds.
> 
> Always route browser requests through a server-side proxy (e.g. Next.js API route `/api/chat-proxy` or Express backend) that injects `process.env.OMNI_API_KEY` on the server!
