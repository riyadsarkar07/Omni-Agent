# Security Policy & Protections

OmniAgent Platform is architected with defense-in-depth principles for enterprise AI agent deployment.

---

## Security Protections Implemented

1. **Server-Side Exclusivity of Gemini API Key**:
   * The Gemini API key is accessed exclusively via `process.env.GEMINI_API_KEY` on the server runtime.
   * It is never prefixed with `NEXT_PUBLIC_`, never sent to browser clients, and never logged in usage files.

2. **One-Way Salted API Key Hashing**:
   * Raw generated keys (`ua_live_...`) are shown to the administrator exactly once upon creation.
   * Only SHA-256 HMAC hashes with an application-specific secret salt (`API_KEY_HASH_SECRET`) are stored in the database.
   * Constant-time comparison (`crypto.timingSafeEqual`) prevents timing oracle attacks during verification.

3. **Multi-Project Isolation**:
   * All REST endpoints enforce strict project boundaries. An API key from Project A cannot access, query, or delete agents, conversations, or usage metrics from Project B.

4. **Rate Limiting & Abuse Prevention**:
   * Token bucket rate limiting is applied on every API key and project tier.
   * Standard RFC rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`) are returned with HTTP 429 upon threshold breach.

5. **Safe Tool Sandboxing**:
   * Registered tools only execute predetermined functions with strict parameter types.
   * Arbitrary code execution (`eval` of unvalidated input), shell access, and uncontrolled network requests are strictly forbidden.

6. **Input Validation & Payload Size Limits**:
   * All incoming payloads are validated using Zod schemas with maximum character boundaries (10,000 chars per message).

7. **Log Redaction**:
   * Usage logs redact raw message prompts, user credentials, and client IP addresses before returning analytics to the dashboard or API consumers.
   * Provider API keys are encrypted at rest, never returned to the browser, and stripped from error messages.

8. **Provider Endpoint SSRF Controls**:
   * Cloud runtimes (Vercel) reject localhost, private, loopback, link-local, and cloud-metadata Base URLs.
   * Production OpenAI-compatible providers must use HTTPS. Local `http://localhost:20128/v1` remains valid only when OmniAgent runs on the same computer.
   * Outbound provider fetches resolve DNS before connecting, block rebinding to private addresses, and refuse redirects to another host or to a private/metadata target.
   * TLS verification is not disabled. CORS allowlists are unchanged.

---

## Reporting Vulnerabilities

If you discover a security vulnerability, please send an advisory to `security@omniagent.io`. Do not open public issues for zero-day vulnerabilities.
