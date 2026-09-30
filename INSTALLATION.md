# Installation Guide

Follow these steps to set up and run the OmniAgent Platform in your local or server environment.

---

## Prerequisites

* **Node.js**: v18.18+ or v20+ recommended
* **npm**: v9+ or pnpm/yarn
* **Google Gemini API Key**: Obtain from [Google AI Studio](https://aistudio.google.com/)
* *(Optional)* **Supabase Project**: If you want persistent PostgreSQL cloud storage (a resilient in-process store is active by default).

---

## Step 1: Environment Setup

Create `.env.local` based on `.env.example`:

```bash
cp .env.example .env.local
```

Fill in the required variables:

```env
# Google Gemini API Credentials
GEMINI_API_KEY="AIzaSy..."
GEMINI_MODEL="gemini-3.5-flash"

# Application Base URL
APP_URL="http://localhost:3000"

# Platform Security Salt
API_KEY_HASH_SECRET="your-high-entropy-random-salt-2026"

# (Optional) Supabase Credentials
NEXT_PUBLIC_SUPABASE_URL="https://your-ref.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbG..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbG..."
```

---

## Step 2: Install Dependencies

```bash
npm install
```

---

## Step 3: (Optional) Apply Supabase PostgreSQL Migrations

If using Supabase:
1. Log into your Supabase Dashboard.
2. Navigate to **SQL Editor**.
3. Open `supabase/migrations/20260101_initial_schema.sql` from this repository.
4. Paste the SQL and click **Run**.
5. All 10 tables, triggers, indexes, and Row Level Security (RLS) policies will be provisioned.

---

## Step 4: Run the Development Server

```bash
npm run dev
```

Visit `http://localhost:3000`. You will see the Admin Dashboard with default projects, configured agents, and an active playground ready to chat.
