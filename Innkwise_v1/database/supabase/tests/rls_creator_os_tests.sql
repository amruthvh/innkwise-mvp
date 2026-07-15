-- Innkwise Creator OS RLS verification.
-- Run in a disposable Supabase database after applying migrations.
-- These tests simulate Supabase Auth by setting request.jwt.claim.sub.

begin;

-- Test identities.
select '00000000-0000-4000-8000-000000000001'::uuid as user_a_id \gset
select '00000000-0000-4000-8000-000000000002'::uuid as user_b_id \gset

-- Seed auth users and profiles as a privileged role.
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  (:'user_a_id', 'authenticated', 'authenticated', 'user-a@example.com', now(), '{}'::jsonb, '{}'::jsonb),
  (:'user_b_id', 'authenticated', 'authenticated', 'user-b@example.com', now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, email)
values
  (:'user_a_id', 'user-a@example.com'),
  (:'user_b_id', 'user-b@example.com')
on conflict (id) do nothing;

insert into public.creator_profiles (user_id, creator_name)
values
  (:'user_a_id', 'Creator A'),
  (:'user_b_id', 'Creator B')
on conflict (user_id) do update set creator_name = excluded.creator_name;

insert into public.conversations (id, user_id, title)
values
  ('10000000-0000-4000-8000-000000000001', :'user_a_id', 'A conversation'),
  ('10000000-0000-4000-8000-000000000002', :'user_b_id', 'B conversation')
on conflict (id) do update set title = excluded.title;

insert into public.messages (id, user_id, conversation_id, role, content)
values
  ('20000000-0000-4000-8000-000000000001', :'user_a_id', '10000000-0000-4000-8000-000000000001', 'user', 'A message'),
  ('20000000-0000-4000-8000-000000000002', :'user_b_id', '10000000-0000-4000-8000-000000000002', 'user', 'B message')
on conflict (id) do update set content = excluded.content;

insert into public.knowledge_sources (id, user_id, source_type, title, url)
values
  ('30000000-0000-4000-8000-000000000001', :'user_a_id', 'link', 'A source', 'https://example.com/a'),
  ('30000000-0000-4000-8000-000000000002', :'user_b_id', 'link', 'B source', 'https://example.com/b')
on conflict (id) do update set title = excluded.title;

insert into public.generated_assets (id, user_id, conversation_id, asset_type, title)
values
  ('40000000-0000-4000-8000-000000000001', :'user_a_id', '10000000-0000-4000-8000-000000000001', 'script', 'A asset'),
  ('40000000-0000-4000-8000-000000000002', :'user_b_id', '10000000-0000-4000-8000-000000000002', 'script', 'B asset')
on conflict (id) do update set title = excluded.title;

insert into public.usage (id, user_id, period_key, period_start, metric, count)
values
  ('50000000-0000-4000-8000-000000000001', :'user_a_id', '2026-07', '2026-07-01', 'message', 1),
  ('50000000-0000-4000-8000-000000000002', :'user_b_id', '2026-07', '2026-07-01', 'message', 1)
on conflict (user_id, period_key, metric) do update set count = excluded.count;

-- Simulate user A.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if (select count(*) from public.creator_profiles) <> 1 then
    raise exception 'RLS failed: user A should only read own creator_profile';
  end if;

  if exists (select 1 from public.conversations where id = '10000000-0000-4000-8000-000000000002') then
    raise exception 'RLS failed: user A can read user B conversation';
  end if;

  if exists (select 1 from public.messages where id = '20000000-0000-4000-8000-000000000002') then
    raise exception 'RLS failed: user A can read user B message';
  end if;

  if exists (select 1 from public.knowledge_sources where id = '30000000-0000-4000-8000-000000000002') then
    raise exception 'RLS failed: user A can read user B knowledge source';
  end if;

  if exists (select 1 from public.generated_assets where id = '40000000-0000-4000-8000-000000000002') then
    raise exception 'RLS failed: user A can read user B generated asset';
  end if;

  if exists (select 1 from public.usage where id = '50000000-0000-4000-8000-000000000002') then
    raise exception 'RLS failed: user A can read user B usage';
  end if;
end $$;

do $$
declare
  affected integer;
begin
  update public.conversations
  set title = 'malicious update'
  where id = '10000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;

  if affected <> 0 then
    raise exception 'RLS failed: user A updated user B conversation';
  end if;
end $$;

do $$
declare
  affected integer;
begin
  delete from public.knowledge_sources
  where id = '30000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;

  if affected <> 0 then
    raise exception 'RLS failed: user A deleted user B knowledge source';
  end if;
end $$;

-- User A cannot insert a message into user B's conversation.
do $$
begin
  insert into public.messages (user_id, conversation_id, role, content)
  values (
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'user',
    'cross-tenant message'
  );

  raise exception 'RLS failed: user A inserted into user B conversation';
exception
  when insufficient_privilege or check_violation or foreign_key_violation then
    null;
end $$;

reset role;
rollback;
