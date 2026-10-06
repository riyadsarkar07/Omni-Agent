-- OmniAgent provider configuration upgrade
-- Extends existing architecture; does not drop provider or agent data.

CREATE TABLE IF NOT EXISTS public.ai_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai-compatible',
  protocol TEXT NOT NULL DEFAULT 'openai' CHECK (protocol IN ('openai', 'anthropic', 'gemini', 'custom')),
  base_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  default_model TEXT NOT NULL DEFAULT '',
  models JSONB NOT NULL DEFAULT '[]'::jsonb,
  capabilities JSONB NOT NULL DEFAULT '["TEXT","STREAMING"]'::jsonb,
  connection_status TEXT NOT NULL DEFAULT 'Untested',
  last_tested TIMESTAMPTZ,
  latency_ms INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  error_rate NUMERIC NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'personal')),
  owner_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'openai-compatible';
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global';
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS owner_id TEXT;
ALTER TABLE public.ai_providers ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_ai_providers_scope ON public.ai_providers(scope, owner_id);
CREATE INDEX IF NOT EXISTS idx_ai_providers_enabled ON public.ai_providers(enabled);
CREATE INDEX IF NOT EXISTS idx_ai_providers_default ON public.ai_providers(is_default);

ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS provider_id TEXT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS fallback_provider_id TEXT;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS fallback_model TEXT;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS default_provider_id TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS default_model TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS fallback_provider_id TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS fallback_model TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_ai_providers_updated_at ON public.ai_providers;
    CREATE TRIGGER update_ai_providers_updated_at
      BEFORE UPDATE ON public.ai_providers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view providers" ON public.ai_providers;
CREATE POLICY "Members can view providers" ON public.ai_providers FOR SELECT
USING (
  scope = 'global'
  OR owner_id = auth.uid()::text
  OR owner_id = auth.uid()::uuid::text
);

DROP POLICY IF EXISTS "Members can insert personal providers" ON public.ai_providers;
CREATE POLICY "Members can insert personal providers" ON public.ai_providers FOR INSERT
WITH CHECK (
  scope = 'personal'
  AND (owner_id = auth.uid()::text OR owner_id = auth.uid()::uuid::text)
);

DROP POLICY IF EXISTS "Members can update own providers" ON public.ai_providers;
CREATE POLICY "Members can update own providers" ON public.ai_providers FOR UPDATE
USING (
  scope = 'global'
  OR owner_id = auth.uid()::text
  OR owner_id = auth.uid()::uuid::text
);

DROP POLICY IF EXISTS "Members can delete own providers" ON public.ai_providers;
CREATE POLICY "Members can delete own providers" ON public.ai_providers FOR DELETE
USING (
  scope = 'personal'
  AND (owner_id = auth.uid()::text OR owner_id = auth.uid()::uuid::text)
);

GRANT ALL ON public.ai_providers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_providers TO authenticated;
