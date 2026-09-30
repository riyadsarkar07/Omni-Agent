# Universal REST API Documentation

Base URL:
`https://<your-domain>/api/v1`

---

## Authentication

Every API call (except `/health`) requires authentication via Bearer token or custom header:

```http
Authorization: Bearer ua_live_xxxxxxxxxxxxxxxxxxxxxxxx
```
or
```http
x-api-key: ua_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Endpoints

### 1. `POST /api/v1/chat`
Send a user message to an agent and receive a JSON response.

**Headers:**
* `Content-Type: application/json`
* `Authorization: Bearer <API_KEY>`

**Request Body:**
```json
{
  "message": "Calculate (450 * 12) + 350 and get the current UTC date",
  "agentId": "agent_pro_reasoning",
  "conversationId": "conv_optional_123",
  "thinkingLevel": "HIGH",
  "overrideModel": "gemini-3.1-pro-preview"
}
```

**cURL Example:**
```bash
curl -X POST https://your-domain.vercel.app/api/v1/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ua_live_demo_development_key_2026" \
  -d '{
    "message": "Hello, what tools can you execute?",
    "thinkingLevel": "HIGH"
  }'
```

**JavaScript fetch:**
```javascript
const res = await fetch("https://your-domain.vercel.app/api/v1/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ua_live_demo_development_key_2026",
  },
  body: JSON.stringify({
    message: "Summarize quantum computing principles in 3 bullet points.",
  }),
});
const data = await res.json();
console.log(data.message);
```

**Response (200 OK):**
```json
{
  "message": "Here is the summary of quantum computing:\n1. Superposition...\n2. Entanglement...",
  "conversationId": "conv_78f192bca1",
  "model": "gemini-3.5-flash",
  "toolCalls": [],
  "usage": {
    "promptTokens": 14,
    "candidateTokens": 85,
    "totalTokens": 99,
    "latencyMs": 482
  }
}
```

---

### 2. `POST /api/v1/chat/stream`
Stream responses chunk by chunk using Server-Sent Events (SSE).

**Request Body:**
```json
{
  "message": "Draft a product launch email for a developer tool."
}
```

**cURL Example:**
```bash
curl -N -X POST https://your-domain.vercel.app/api/v1/chat/stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ua_live_demo_development_key_2026" \
  -d '{"message": "Write a short poem about code."}'
```

**SSE Events Format:**
```
data: {"type":"start","conversationId":"conv_912384","model":"gemini-3.5-flash"}

data: {"type":"chunk","text":"In lines"}

data: {"type":"chunk","text":" of code"}

data: {"type":"done","conversationId":"conv_912384","usage":{"promptTokens":18,"candidateTokens":42,"totalTokens":60,"latencyMs":320}}
```

---

### 3. `GET /api/v1/agents`
List agents configured for the authenticated project.

**cURL Example:**
```bash
curl https://your-domain.vercel.app/api/v1/agents \
  -H "Authorization: Bearer ua_live_demo_development_key_2026"
```

---

### 4. `POST /api/v1/agents`
Create a new AI agent within the project.

**Request Body:**
```json
{
  "name": "Dating App Matchmaker",
  "description": "Engaging conversational assistant for dating profiles",
  "model": "gemini-3.5-flash",
  "system_instructions": "You are a warm, witty dating assistant helping users craft witty bios.",
  "temperature": 0.8,
  "thinking_level": "OFF",
  "tools_enabled": ["get_current_time"]
}
```

---

### 5. `PATCH /api/v1/agents/:id`
Update an existing agent's configuration.

---

### 6. `DELETE /api/v1/agents/:id`
Delete an agent with ownership verification.

---

### 7. `GET /api/v1/conversations` & `GET /api/v1/conversations/:id`
Browse past multi-turn threads and message history.

---

### 8. `GET /api/v1/api-keys` & `POST /api/v1/api-keys`
Manage project API keys. Raw keys are revealed only once upon POST creation.

---

### 9. `GET /api/v1/usage`
Retrieve request counts, token breakdown, and performance logs.

---

### 10. `GET /api/v1/health`
Public health status check.
