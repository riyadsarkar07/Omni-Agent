# Vercel & GitHub Deployment Guide

Deploying OmniAgent Platform to Vercel and connecting it to GitHub is straightforward and takes less than 3 minutes.

---

## 1. Push to GitHub

Initialize git and push to your private or public GitHub repository:

```bash
git init
git add .
git commit -m "feat: initial universal ai agent platform"
git branch -M main
git remote add origin https://github.com/<your-username>/omniagent-ai-platform.git
git push -u origin main
```

---

## 2. Deploy to Vercel

1. Log into your [Vercel Dashboard](https://vercel.com).
2. Click **Add New Project** and select your GitHub repository.
3. In **Build and Output Settings**, Vercel automatically selects **Next.js**.
4. Expand the **Environment Variables** panel and add:

| Variable Name | Description | Example Value |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API Secret | `AIzaSy...` |
| `GEMINI_MODEL` | Default Agent Model | `gemini-3.5-flash` |
| `APP_URL` | Vercel production URL | `https://your-domain.vercel.app` |
| `API_KEY_HASH_SECRET` | Salt for API key storage | `random_secret_salt` |
| `NEXT_PUBLIC_SUPABASE_URL` | (Optional) Supabase URL | `https://xyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (Optional) Service role key | `eyJhbG...` |

5. Click **Deploy**.
6. When deployment finishes, your REST API is live at:
   `https://your-domain.vercel.app/api/v1`

---

## 3. Post-Deployment Verification

Test the health check endpoint:

```bash
curl https://your-domain.vercel.app/api/v1/health
```

Expected Response:
```json
{
  "status": "healthy",
  "service": "OmniAgent AI Platform",
  "version": "1.0.0",
  "gemini_engine": {
    "status": "ready",
    "default_model": "gemini-3.5-flash"
  }
}
```
