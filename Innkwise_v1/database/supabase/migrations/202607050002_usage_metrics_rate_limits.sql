-- Usage metric expansion for AI rate limiting and abuse prevention.
-- Idempotent: refreshes the usage metric check constraint with the expanded
-- metric set needed by the centralized AI Gateway.

alter table if exists public.usage
drop constraint if exists usage_metric_check;

alter table if exists public.usage
add constraint usage_metric_check check (
  metric in (
    'message',
    'generation',
    'storage_mb',
    'knowledge_source',
    'asset',
    'token',
    'ai_generation',
    'prompt_token',
    'completion_token',
    'embedding',
    'upload',
    'latency_ms',
    'failed_request',
    'blocked_request'
  )
);

create index if not exists usage_user_period_metric_idx
on public.usage(user_id, period_key, metric);
