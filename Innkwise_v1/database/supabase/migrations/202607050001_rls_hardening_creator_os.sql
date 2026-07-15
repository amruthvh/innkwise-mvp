-- RLS Hardening for Innkwise Creator OS.
-- Safe to run multiple times. This migration tightens tenant isolation for all
-- user-owned creator tables and makes messages inherit ownership from their
-- parent conversation instead of trusting messages.user_id.

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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table if exists public.profiles enable row level security;
alter table if exists public.creator_profiles enable row level security;
alter table if exists public.conversations enable row level security;
alter table if exists public.messages enable row level security;
alter table if exists public.knowledge_sources enable row level security;
alter table if exists public.generated_assets enable row level security;
alter table if exists public.usage enable row level security;

alter table if exists public.profiles force row level security;
alter table if exists public.creator_profiles force row level security;
alter table if exists public.conversations force row level security;
alter table if exists public.messages force row level security;
alter table if exists public.knowledge_sources force row level security;
alter table if exists public.generated_assets force row level security;
alter table if exists public.usage force row level security;

-- Profiles are keyed directly by auth.users(id).
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
for delete
using (auth.uid() = id);

-- Creator profile ownership.
drop policy if exists "creator_profiles_all_own" on public.creator_profiles;
drop policy if exists "creator_profiles_select_own" on public.creator_profiles;
drop policy if exists "creator_profiles_insert_own" on public.creator_profiles;
drop policy if exists "creator_profiles_update_own" on public.creator_profiles;
drop policy if exists "creator_profiles_delete_own" on public.creator_profiles;

create policy "creator_profiles_select_own" on public.creator_profiles
for select
using (auth.uid() = user_id);

create policy "creator_profiles_insert_own" on public.creator_profiles
for insert
with check (auth.uid() = user_id);

create policy "creator_profiles_update_own" on public.creator_profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "creator_profiles_delete_own" on public.creator_profiles
for delete
using (auth.uid() = user_id);

-- Conversation ownership.
drop policy if exists "conversations_all_own" on public.conversations;
drop policy if exists "conversations_select_own" on public.conversations;
drop policy if exists "conversations_insert_own" on public.conversations;
drop policy if exists "conversations_update_own" on public.conversations;
drop policy if exists "conversations_delete_own" on public.conversations;

create policy "conversations_select_own" on public.conversations
for select
using (auth.uid() = user_id);

create policy "conversations_insert_own" on public.conversations
for insert
with check (auth.uid() = user_id);

create policy "conversations_update_own" on public.conversations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "conversations_delete_own" on public.conversations
for delete
using (auth.uid() = user_id);

-- Messages inherit ownership through conversations. Do not trust messages.user_id.
drop policy if exists "messages_all_own" on public.messages;
drop policy if exists "messages_select_conversation_owner" on public.messages;
drop policy if exists "messages_insert_conversation_owner" on public.messages;
drop policy if exists "messages_update_conversation_owner" on public.messages;
drop policy if exists "messages_delete_conversation_owner" on public.messages;

create policy "messages_select_conversation_owner" on public.messages
for select
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = auth.uid()
  )
);

create policy "messages_insert_conversation_owner" on public.messages
for insert
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = auth.uid()
  )
);

create policy "messages_update_conversation_owner" on public.messages
for update
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = auth.uid()
  )
);

create policy "messages_delete_conversation_owner" on public.messages
for delete
using (
  exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and c.user_id = auth.uid()
  )
);

-- Knowledge source ownership.
drop policy if exists "knowledge_sources_all_own" on public.knowledge_sources;
drop policy if exists "knowledge_sources_select_own" on public.knowledge_sources;
drop policy if exists "knowledge_sources_insert_own" on public.knowledge_sources;
drop policy if exists "knowledge_sources_update_own" on public.knowledge_sources;
drop policy if exists "knowledge_sources_delete_own" on public.knowledge_sources;

create policy "knowledge_sources_select_own" on public.knowledge_sources
for select
using (auth.uid() = user_id);

create policy "knowledge_sources_insert_own" on public.knowledge_sources
for insert
with check (auth.uid() = user_id);

create policy "knowledge_sources_update_own" on public.knowledge_sources
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "knowledge_sources_delete_own" on public.knowledge_sources
for delete
using (auth.uid() = user_id);

-- Generated asset ownership.
drop policy if exists "generated_assets_all_own" on public.generated_assets;
drop policy if exists "generated_assets_select_own" on public.generated_assets;
drop policy if exists "generated_assets_insert_own" on public.generated_assets;
drop policy if exists "generated_assets_update_own" on public.generated_assets;
drop policy if exists "generated_assets_delete_own" on public.generated_assets;

create policy "generated_assets_select_own" on public.generated_assets
for select
using (auth.uid() = user_id);

create policy "generated_assets_insert_own" on public.generated_assets
for insert
with check (auth.uid() = user_id);

create policy "generated_assets_update_own" on public.generated_assets
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "generated_assets_delete_own" on public.generated_assets
for delete
using (auth.uid() = user_id);

-- Usage ownership.
drop policy if exists "usage_select_own" on public.usage;
drop policy if exists "usage_insert_own" on public.usage;
drop policy if exists "usage_update_own" on public.usage;
drop policy if exists "usage_delete_own" on public.usage;

create policy "usage_select_own" on public.usage
for select
using (auth.uid() = user_id);

create policy "usage_insert_own" on public.usage
for insert
with check (auth.uid() = user_id);

create policy "usage_update_own" on public.usage
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "usage_delete_own" on public.usage
for delete
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Indexes for RLS predicates, ownership lookups, and timeline ordering.
-- ---------------------------------------------------------------------------

create index if not exists profiles_created_at_idx
on public.profiles(created_at desc);

create index if not exists creator_profiles_user_id_idx
on public.creator_profiles(user_id);

create index if not exists creator_profiles_created_at_idx
on public.creator_profiles(created_at desc);

create index if not exists conversations_user_id_idx
on public.conversations(user_id);

create index if not exists conversations_created_at_idx
on public.conversations(created_at desc);

create index if not exists conversations_user_created_at_idx
on public.conversations(user_id, created_at desc);

create index if not exists messages_user_id_idx
on public.messages(user_id);

create index if not exists messages_conversation_id_idx
on public.messages(conversation_id);

create index if not exists messages_created_at_idx
on public.messages(created_at desc);

create index if not exists messages_conversation_created_at_idx
on public.messages(conversation_id, created_at asc);

create index if not exists knowledge_sources_user_id_idx
on public.knowledge_sources(user_id);

create index if not exists knowledge_sources_created_at_idx
on public.knowledge_sources(created_at desc);

create index if not exists knowledge_sources_user_created_at_idx
on public.knowledge_sources(user_id, created_at desc);

create index if not exists generated_assets_user_id_idx
on public.generated_assets(user_id);

create index if not exists generated_assets_conversation_id_idx
on public.generated_assets(conversation_id);

create index if not exists generated_assets_source_message_id_idx
on public.generated_assets(source_message_id);

create index if not exists generated_assets_created_at_idx
on public.generated_assets(created_at desc);

create index if not exists generated_assets_user_created_at_idx
on public.generated_assets(user_id, created_at desc);

create index if not exists usage_user_id_idx
on public.usage(user_id);

create index if not exists usage_created_at_idx
on public.usage(created_at desc);

create index if not exists usage_user_period_idx
on public.usage(user_id, period_key);

-- ---------------------------------------------------------------------------
-- Integrity hardening.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_message_conversation_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  select c.user_id
  into owner_id
  from public.conversations c
  where c.id = new.conversation_id;

  if owner_id is null then
    raise exception 'Conversation % does not exist', new.conversation_id
      using errcode = '23503';
  end if;

  if new.user_id is null then
    new.user_id = owner_id;
  elsif new.user_id <> owner_id then
    raise exception 'Message user_id must match conversation owner'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_enforce_conversation_owner on public.messages;
create trigger messages_enforce_conversation_owner
before insert or update of user_id, conversation_id on public.messages
for each row execute function public.enforce_message_conversation_owner();

create or replace function public.enforce_generated_asset_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_owner uuid;
  message_owner uuid;
begin
  if new.conversation_id is not null then
    select c.user_id
    into conversation_owner
    from public.conversations c
    where c.id = new.conversation_id;

    if conversation_owner is null then
      raise exception 'Conversation % does not exist', new.conversation_id
        using errcode = '23503';
    end if;

    if new.user_id <> conversation_owner then
      raise exception 'Generated asset user_id must match conversation owner'
        using errcode = '23514';
    end if;
  end if;

  if new.source_message_id is not null then
    select m.user_id
    into message_owner
    from public.messages m
    where m.id = new.source_message_id;

    if message_owner is null then
      raise exception 'Source message % does not exist', new.source_message_id
        using errcode = '23503';
    end if;

    if new.user_id <> message_owner then
      raise exception 'Generated asset user_id must match source message owner'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists generated_assets_enforce_owner on public.generated_assets;
create trigger generated_assets_enforce_owner
before insert or update of user_id, conversation_id, source_message_id on public.generated_assets
for each row execute function public.enforce_generated_asset_owner();

-- Ensure updated_at automation exists on all user-owned Creator OS tables.
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists creator_profiles_set_updated_at on public.creator_profiles;
create trigger creator_profiles_set_updated_at before update on public.creator_profiles
for each row execute function public.set_updated_at();

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at before update on public.conversations
for each row execute function public.set_updated_at();

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at before update on public.messages
for each row execute function public.set_updated_at();

drop trigger if exists knowledge_sources_set_updated_at on public.knowledge_sources;
create trigger knowledge_sources_set_updated_at before update on public.knowledge_sources
for each row execute function public.set_updated_at();

drop trigger if exists generated_assets_set_updated_at on public.generated_assets;
create trigger generated_assets_set_updated_at before update on public.generated_assets
for each row execute function public.set_updated_at();

drop trigger if exists usage_set_updated_at on public.usage;
create trigger usage_set_updated_at before update on public.usage
for each row execute function public.set_updated_at();
