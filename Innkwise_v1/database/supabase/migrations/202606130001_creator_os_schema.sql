-- Creator Operating System schema for Innkwise.
-- Supabase-native ownership uses auth.users(id) and auth.uid() RLS checks.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  avatar_url text,
  plan text not null default 'FREE',
  stripe_customer_id text,
  onboarding_status jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  creator_name text,
  brand_name text,
  tagline text,
  bio text,
  experience_level text,
  archetypes text[] not null default '{}',
  goals jsonb not null default '{}'::jsonb,
  niche jsonb not null default '{}'::jsonb,
  audience jsonb not null default '{}'::jsonb,
  platform_preferences jsonb not null default '{}'::jsonb,
  writing_preferences jsonb not null default '{}'::jsonb,
  ai_controls jsonb not null default '{}'::jsonb,
  memory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_profiles_user_id_key unique (user_id)
);

create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_type text not null default 'file',
  title text not null,
  description text,
  url text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  checksum text,
  extraction_status text not null default 'pending',
  extracted_text text,
  summary text,
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  embedding_metadata jsonb not null default '{}'::jsonb,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_sources_source_type_check check (
    source_type in (
      'file',
      'image',
      'link',
      'video',
      'audio',
      'pdf',
      'research_paper',
      'book',
      'newsletter',
      'blog',
      'youtube_channel',
      'website',
      'other'
    )
  ),
  constraint knowledge_sources_file_or_url_check check (
    url is not null or storage_path is not null
  )
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  status text not null default 'active',
  context_snapshot jsonb not null default '{}'::jsonb,
  memory_state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_status_check check (status in ('active', 'archived', 'deleted'))
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null,
  content text,
  content_json jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  token_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_role_check check (role in ('system', 'user', 'assistant', 'tool'))
);

create table if not exists public.generated_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  source_message_id uuid references public.messages(id) on delete set null,
  asset_type text not null,
  title text,
  prompt text,
  output_text text,
  output_json jsonb not null default '{}'::jsonb,
  model text,
  parameters jsonb not null default '{}'::jsonb,
  source_context jsonb not null default '{}'::jsonb,
  status text not null default 'completed',
  storage_bucket text,
  storage_path text,
  public_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generated_assets_asset_type_check check (
    asset_type in ('script', 'thumbnail', 'image', 'document', 'outline', 'post', 'email', 'other')
  ),
  constraint generated_assets_status_check check (status in ('queued', 'generating', 'completed', 'failed', 'archived'))
);

create table if not exists public.usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_key text not null,
  period_start date not null,
  metric text not null,
  count integer not null default 0,
  credits_used numeric(12, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_metric_check check (
    metric in ('message', 'generation', 'storage_mb', 'knowledge_source', 'asset', 'token')
  ),
  constraint usage_user_period_metric_key unique (user_id, period_key, metric)
);

create index if not exists profiles_created_at_idx on public.profiles(created_at desc);
create index if not exists creator_profiles_user_id_idx on public.creator_profiles(user_id);
create index if not exists creator_profiles_created_at_idx on public.creator_profiles(created_at desc);
create index if not exists creator_profiles_memory_gin_idx on public.creator_profiles using gin(memory);
create index if not exists knowledge_sources_user_id_idx on public.knowledge_sources(user_id);
create index if not exists knowledge_sources_created_at_idx on public.knowledge_sources(created_at desc);
create index if not exists knowledge_sources_user_created_at_idx on public.knowledge_sources(user_id, created_at desc);
create index if not exists knowledge_sources_metadata_gin_idx on public.knowledge_sources using gin(metadata);
create index if not exists knowledge_sources_embedding_metadata_gin_idx on public.knowledge_sources using gin(embedding_metadata);
create index if not exists conversations_user_id_idx on public.conversations(user_id);
create index if not exists conversations_created_at_idx on public.conversations(created_at desc);
create index if not exists conversations_user_created_at_idx on public.conversations(user_id, created_at desc);
create index if not exists conversations_context_snapshot_gin_idx on public.conversations using gin(context_snapshot);
create index if not exists messages_user_id_idx on public.messages(user_id);
create index if not exists messages_created_at_idx on public.messages(created_at desc);
create index if not exists messages_conversation_created_at_idx on public.messages(conversation_id, created_at asc);
create index if not exists messages_content_json_gin_idx on public.messages using gin(content_json);
create index if not exists generated_assets_user_id_idx on public.generated_assets(user_id);
create index if not exists generated_assets_created_at_idx on public.generated_assets(created_at desc);
create index if not exists generated_assets_user_created_at_idx on public.generated_assets(user_id, created_at desc);
create index if not exists generated_assets_output_json_gin_idx on public.generated_assets using gin(output_json);
create index if not exists generated_assets_source_context_gin_idx on public.generated_assets using gin(source_context);
create index if not exists usage_user_id_idx on public.usage(user_id);
create index if not exists usage_created_at_idx on public.usage(created_at desc);
create index if not exists usage_user_period_idx on public.usage(user_id, period_key);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists creator_profiles_set_updated_at on public.creator_profiles;
create trigger creator_profiles_set_updated_at before update on public.creator_profiles
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_sources_set_updated_at on public.knowledge_sources;
create trigger knowledge_sources_set_updated_at before update on public.knowledge_sources
for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at before update on public.messages
for each row execute function public.set_updated_at();

drop trigger if exists generated_assets_set_updated_at on public.generated_assets;
create trigger generated_assets_set_updated_at before update on public.generated_assets
for each row execute function public.set_updated_at();

drop trigger if exists usage_set_updated_at on public.usage;
create trigger usage_set_updated_at before update on public.usage
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.creator_profiles enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.generated_assets enable row level security;
alter table public.usage enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "creator_profiles_all_own" on public.creator_profiles;
create policy "creator_profiles_all_own" on public.creator_profiles
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "knowledge_sources_all_own" on public.knowledge_sources;
create policy "knowledge_sources_all_own" on public.knowledge_sources
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "conversations_all_own" on public.conversations;
create policy "conversations_all_own" on public.conversations
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "messages_all_own" on public.messages;
create policy "messages_all_own" on public.messages
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "generated_assets_all_own" on public.generated_assets;
create policy "generated_assets_all_own" on public.generated_assets
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "usage_select_own" on public.usage;
create policy "usage_select_own" on public.usage
for select using (auth.uid() = user_id);

drop policy if exists "usage_insert_own" on public.usage;
create policy "usage_insert_own" on public.usage
for insert with check (auth.uid() = user_id);

drop policy if exists "usage_update_own" on public.usage;
create policy "usage_update_own" on public.usage
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creator-knowledge',
  'creator-knowledge',
  false,
  52428800,
  array[
    'application/pdf',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

drop policy if exists "creator_knowledge_select_own" on storage.objects;
create policy "creator_knowledge_select_own" on storage.objects
for select using (
  bucket_id = 'creator-knowledge'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "creator_knowledge_insert_own" on storage.objects;
create policy "creator_knowledge_insert_own" on storage.objects
for insert with check (
  bucket_id = 'creator-knowledge'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "creator_knowledge_update_own" on storage.objects;
create policy "creator_knowledge_update_own" on storage.objects
for update using (
  bucket_id = 'creator-knowledge'
  and auth.uid()::text = (storage.foldername(name))[1]
) with check (
  bucket_id = 'creator-knowledge'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "creator_knowledge_delete_own" on storage.objects;
create policy "creator_knowledge_delete_own" on storage.objects
for delete using (
  bucket_id = 'creator-knowledge'
  and auth.uid()::text = (storage.foldername(name))[1]
);
