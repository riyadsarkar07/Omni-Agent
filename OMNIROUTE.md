# Secure OmniRoute Remote Connection

OmniAgent on Vercel cannot reach OmniRoute at `http://localhost:20128/v1` on your Windows PC. Localhost is the loopback address of the machine that is making the request. From Vercel that machine is a cloud function, not your PC. OmniAgent will not invent or substitute a public URL for localhost.

Keep two separate provider configurations:

- Local development: `http://localhost:20128/v1` while OmniAgent and OmniRoute run on the same computer.
- Production: a public HTTPS Base URL you control, saved on the production provider. API keys stay server-side.

Do not disable TLS verification, do not weaken CORS, and do not expose the OmniRoute dashboard or an unauthenticated API on the public internet.

## 1. Local development

1. Start OmniRoute on the Windows PC so it listens at `http://localhost:20128/v1`.
2. Run OmniAgent locally (`npm run dev`) on the same computer.
3. In API Configuration, save an OpenAI Compatible provider:
   - Base URL: `http://localhost:20128/v1`
   - API key: the OmniRoute key (stored only on the server after save)
   - Model ID: a model that OmniRoute actually serves
4. Click Test Connection. Success requires a real `GET /v1/models` and a real chat completion. Streaming is verified when the provider has STREAMING enabled.

## 2. Production: Cloudflare Tunnel (recommended)

Use a named HTTPS tunnel so Vercel can reach only the OpenAI-compatible `/v1` API. Keep the tunnel process running on the Windows PC. If the tunnel stops, production OmniRoute calls fail.

Example `config.yml` (comments are on their own lines):

```yml
# Restrict the public hostname to the local OmniRoute API.
tunnel: YOUR_TUNNEL_ID
credentials-file: C:\Users\YOUR_USER\.cloudflared\YOUR_TUNNEL_ID.json

ingress:
  - hostname: omniroute.example.com
    service: http://127.0.0.1:20128
  - service: http_status:404
```

Recommended controls:

- Use a hostname you own. Require Cloudflare Access, mTLS, or an allowlist so only OmniAgent/Vercel can call it.
- Forward only the API. Do not publish the OmniRoute dashboard, admin UI, or extra ports.
- OmniRoute must still require a Bearer API key. An open `/v1` endpoint is not a valid setup.
- Leave HTTP/HTTPS between Cloudflare and the internet on a valid certificate. OmniAgent does not disable TLS verification.

Save the production provider as:

- Base URL: `https://omniroute.example.com/v1`
- API key: the same OmniRoute key, stored server-side in OmniAgent
- Do not reuse the localhost provider row for production

Start the tunnel and keep it online:

```bash
# Run the named tunnel and leave it running
cloudflared tunnel run YOUR_TUNNEL_ID
```

## 3. Production: locked-down VPS reverse proxy

If you prefer a VPS, run OmniRoute only on a private interface and terminate HTTPS on the proxy.

- Bind OmniRoute to `127.0.0.1:20128` on the VPS, not `0.0.0.0`.
- Put nginx, Caddy, or another reverse proxy in front with a valid certificate.
- Require the OmniRoute Bearer key. Optionally also restrict by Cloudflare Access, VPN, or IP allowlist to Vercel egress if you manage it.
- Do not serve the OmniRoute dashboard on the public hostname.

Save `https://omniroute.example.com/v1` as the production Base URL.

## 4. Production readiness checklist

Do not treat the connection as working until OmniAgent reports success from a real request. The Test Connection action runs these checks and will not invent a pass:

1. Confirm the public hostname is HTTPS and reachable from Vercel (not localhost, not a private IP, not a cloud-metadata address).
2. `GET /v1/models` with `Authorization: Bearer <OmniRoute key>` returns 200.
3. A real `POST /v1/chat/completions` through the existing OpenAI-compatible provider router succeeds.
4. If STREAMING is enabled, an SSE chat completion is verified.
5. Failures are reported distinctly: authentication, DNS, timeout, TLS, redirect/SSRF, or upstream HTTP errors.

Manual probe from a machine that is not your Windows PC (or after deploy, use Test Connection in the Vercel-hosted dashboard):

```bash
# Replace the hostname and key. Do not paste production keys into tickets or logs.
curl -sS https://omniroute.example.com/v1/models \
  -H "Authorization: Bearer YOUR_OMNIROUTE_KEY"
```

Expected: JSON model list, HTTP 200. HTTP 401/403 means the key was rejected. Timeouts, DNS errors, or TLS errors mean the tunnel/VPS is not ready.

## 5. What OmniAgent will not do

- Replace `http://localhost:20128/v1` with an invented public URL
- Disable SSRF protection or allow private, loopback, link-local, or metadata hosts in production
- Follow redirects to another host or to a private address
- Disable TLS verification
- Put provider API keys in the browser bundle, UI responses, or logs
