-- Semantic Retrieval V1.
-- Adds pgvector support and stores one document-level embedding per knowledge source.

create extension if not exists vector;

alter table public.knowledge_sources
add column if not exists embedding vector(384);

create index if not exists knowledge_sources_embedding_cosine_idx
on public.knowledge_sources
using ivfflat (embedding vector_cosine_ops)
with (lists = 100)
where embedding is not null;
