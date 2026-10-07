CREATE TABLE IF NOT EXISTS public.resource_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('conversation', 'agent')),
  resource_id TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_with_email TEXT,
  permission TEXT NOT NULL DEFAULT 'read' CHECK (permission = 'read'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (resource_type, resource_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_shares_owner ON public.resource_shares(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_shares_user ON public.resource_shares(shared_with_user_id, resource_type);
CREATE INDEX IF NOT EXISTS idx_resource_shares_resource ON public.resource_shares(resource_type, resource_id);

ALTER TABLE public.resource_shares ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.resource_shares TO service_role;
GRANT SELECT, INSERT, DELETE ON public.resource_shares TO authenticated;

DROP POLICY IF EXISTS "Owners manage shares" ON public.resource_shares;
CREATE POLICY "Owners manage shares" ON public.resource_shares FOR ALL
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Recipients can view shares" ON public.resource_shares;
CREATE POLICY "Recipients can view shares" ON public.resource_shares FOR SELECT
USING (shared_with_user_id = auth.uid());
