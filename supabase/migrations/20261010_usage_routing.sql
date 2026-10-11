ALTER TABLE public.usage_logs
  ADD COLUMN IF NOT EXISTS requested_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS requested_model TEXT,
  ADD COLUMN IF NOT EXISTS selected_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS selected_model TEXT,
  ADD COLUMN IF NOT EXISTS fallback_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_category TEXT;
