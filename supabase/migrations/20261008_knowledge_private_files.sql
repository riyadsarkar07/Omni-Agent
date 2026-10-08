-- Private knowledge documents/chunks for owner-scoped RAG.
-- Embeddings are stored as JSONB so this works without pgvector.
-- Create a private Storage bucket named `user-files` in the Supabase dashboard
-- (public=false). The app also attempts to create it via the service role.

CREATE TABLE IF NOT EXISTS public.knowledge_documents (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.user_files(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'unsupported', 'failed')),
  chunk_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_user ON public.knowledge_documents(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id UUID PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.user_files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding JSONB,
  embedding_model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_user ON public.knowledge_chunks(user_id, document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_file ON public.knowledge_chunks(user_id, file_id);

ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.knowledge_documents TO service_role;
GRANT ALL ON public.knowledge_chunks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_chunks TO authenticated;

DROP POLICY IF EXISTS "Users manage own knowledge documents" ON public.knowledge_documents;
CREATE POLICY "Users manage own knowledge documents" ON public.knowledge_documents FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users manage own knowledge chunks" ON public.knowledge_chunks;
CREATE POLICY "Users manage own knowledge chunks" ON public.knowledge_chunks FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
