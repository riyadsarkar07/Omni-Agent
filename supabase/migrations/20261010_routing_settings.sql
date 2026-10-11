ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS routing JSONB NOT NULL DEFAULT '{}'::jsonb;
