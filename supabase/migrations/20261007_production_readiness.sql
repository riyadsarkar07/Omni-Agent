-- Production-readiness schema alignment
-- profiles.status / last_active_at, conversation owner index, platform settings

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_status_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'disabled'));
  END IF;
END $$;

ALTER TABLE public.usage_logs
  ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON public.usage_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_owner ON public.conversations ((metadata->>'owner_id'));
CREATE INDEX IF NOT EXISTS idx_project_members_user ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  default_model TEXT,
  admin_contact_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by TEXT
);

INSERT INTO public.platform_settings (id, default_model, admin_contact_email)
VALUES ('global', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages platform settings" ON public.platform_settings;

GRANT ALL ON public.platform_settings TO service_role;
GRANT SELECT ON public.platform_settings TO authenticated;
