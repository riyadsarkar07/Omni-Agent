ALTER TABLE public.usage_logs
  ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_usage_logs_user ON public.usage_logs(user_id, created_at DESC);
