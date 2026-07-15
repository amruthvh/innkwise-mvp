-- Billing System V1 for Innkwise.
-- Lemon Squeezy identifiers are stored server-side only; public clients read
-- plan/pricing state through application APIs.

create extension if not exists "pgcrypto";

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  currency text not null,
  price numeric(12, 2) not null,
  variant_id text not null unique,
  region text not null,
  is_founding boolean not null default false,
  is_active boolean not null default true,
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_region_check check (region in ('india', 'global')),
  constraint plans_currency_check check (currency in ('INR', 'USD'))
);

create table if not exists public.pricing_cohorts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  max_slots integer not null,
  claimed_slots integer not null default 0,
  is_open boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_cohorts_slots_check check (
    max_slots >= 0
    and claimed_slots >= 0
    and claimed_slots <= max_slots
  )
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  lemon_subscription_id text not null unique,
  lemon_customer_id text,
  lemon_order_id text,
  lemon_product_id text,
  lemon_variant_id text,
  status text not null,
  status_formatted text,
  renews_at timestamptz,
  ends_at timestamptz,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  pause_mode text,
  card_brand text,
  card_last_four text,
  customer_portal_url text,
  update_payment_method_url text,
  country text,
  plan_slug text,
  custom_data jsonb not null default '{}'::jsonb,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'lemonsqueezy',
  event_name text not null,
  event_id text not null unique,
  resource_id text,
  processed_at timestamptz,
  processing_status text not null default 'received',
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webhook_logs_processing_status_check check (
    processing_status in ('received', 'processed', 'failed', 'ignored')
  )
);

create index if not exists plans_region_active_idx on public.plans(region, is_active);
create index if not exists plans_created_at_idx on public.plans(created_at desc);
create index if not exists pricing_cohorts_created_at_idx on public.pricing_cohorts(created_at desc);
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_created_at_idx on public.subscriptions(created_at desc);
create index if not exists subscriptions_user_created_at_idx on public.subscriptions(user_id, created_at desc);
create index if not exists subscriptions_status_idx on public.subscriptions(status);
create index if not exists subscriptions_plan_id_idx on public.subscriptions(plan_id);
create index if not exists webhook_logs_created_at_idx on public.webhook_logs(created_at desc);
create index if not exists webhook_logs_event_name_idx on public.webhook_logs(event_name);

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists pricing_cohorts_set_updated_at on public.pricing_cohorts;
create trigger pricing_cohorts_set_updated_at before update on public.pricing_cohorts
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists webhook_logs_set_updated_at on public.webhook_logs;
create trigger webhook_logs_set_updated_at before update on public.webhook_logs
for each row execute function public.set_updated_at();

insert into public.pricing_cohorts (slug, display_name, max_slots, claimed_slots, is_open)
values ('founding_creator', 'Founding Creator', 100, 0, true)
on conflict (slug) do update set
  display_name = excluded.display_name,
  max_slots = excluded.max_slots,
  is_open = case
    when public.pricing_cohorts.claimed_slots >= excluded.max_slots then false
    else public.pricing_cohorts.is_open
  end;

create or replace function public.claim_founding_creator_slot()
returns public.pricing_cohorts
language plpgsql
security definer
set search_path = public
as $$
declare
  cohort public.pricing_cohorts;
begin
  update public.pricing_cohorts
  set
    claimed_slots = claimed_slots + 1,
    is_open = (claimed_slots + 1) < max_slots,
    updated_at = now()
  where slug = 'founding_creator'
    and is_open = true
    and claimed_slots < max_slots
  returning * into cohort;

  if not found then
    select * into cohort
    from public.pricing_cohorts
    where slug = 'founding_creator';
  end if;

  return cohort;
end;
$$;

create or replace function public.close_full_pricing_cohorts()
returns trigger
language plpgsql
as $$
begin
  if new.claimed_slots >= new.max_slots then
    new.is_open = false;
  end if;
  return new;
end;
$$;

drop trigger if exists pricing_cohorts_close_when_full on public.pricing_cohorts;
create trigger pricing_cohorts_close_when_full before insert or update on public.pricing_cohorts
for each row execute function public.close_full_pricing_cohorts();

alter table public.plans enable row level security;
alter table public.pricing_cohorts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.webhook_logs enable row level security;

drop policy if exists "plans_public_read_active" on public.plans;
create policy "plans_public_read_active" on public.plans
for select using (is_active = true);

drop policy if exists "pricing_cohorts_public_read" on public.pricing_cohorts;
create policy "pricing_cohorts_public_read" on public.pricing_cohorts
for select using (true);

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
for select using (auth.uid() = user_id);

drop policy if exists "subscriptions_update_own_noop" on public.subscriptions;
create policy "subscriptions_update_own_noop" on public.subscriptions
for update using (false) with check (false);

drop policy if exists "webhook_logs_no_client_access" on public.webhook_logs;
create policy "webhook_logs_no_client_access" on public.webhook_logs
for all using (false) with check (false);
