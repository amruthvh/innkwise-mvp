# Innkwise Supabase RLS Security Audit

Date: 2026-07-05

Scope:

- `profiles`
- `creator_profiles`
- `conversations`
- `messages`
- `knowledge_sources`
- `generated_assets`
- `usage`

## Summary

The Creator OS schema already had Row Level Security enabled for the core user-owned tables. The major issue was the `messages` policy: it trusted `messages.user_id`. Because messages are owned through `conversation_id`, a database-level bug or malformed insert could create confusing ownership state.

The new hardening migration replaces that with conversation-derived ownership checks and adds integrity triggers so messages and generated assets cannot be linked across tenants.

Migration:

- `database/supabase/migrations/202607050001_rls_hardening_creator_os.sql`

SQL tests:

- `database/supabase/tests/rls_creator_os_tests.sql`

## Table Audit

| Table | RLS Status Before | Policy Status Before | Risk | Fix |
| --- | --- | --- | --- | --- |
| `profiles` | Enabled | Own-row select/insert/update | No delete policy. Low isolation risk, but incomplete CRUD policy. | Added explicit own-row delete policy and forced RLS. |
| `creator_profiles` | Enabled | `FOR ALL user_id = auth.uid()` | Correct isolation, but broad policy name made auditing less clear. | Replaced with explicit select/insert/update/delete policies. |
| `conversations` | Enabled | `FOR ALL user_id = auth.uid()` | Correct isolation, but broad policy name made auditing less clear. | Replaced with explicit select/insert/update/delete policies. |
| `messages` | Enabled | `FOR ALL user_id = auth.uid()` | High: trusted `messages.user_id` instead of conversation ownership. | Replaced with `EXISTS` policies through `conversations.user_id`. Added trigger to enforce `messages.user_id = conversations.user_id`. |
| `knowledge_sources` | Enabled | `FOR ALL user_id = auth.uid()` | Correct isolation, but broad policy name made auditing less clear. | Replaced with explicit select/insert/update/delete policies. |
| `generated_assets` | Enabled | `FOR ALL user_id = auth.uid()` | Medium: `conversation_id` and `source_message_id` could reference another user's resources if inserted by a privileged buggy path. | Added explicit policies and trigger validating referenced conversation/message ownership. |
| `usage` | Enabled | Select/insert/update only | Missing delete policy relative to requested CRUD model. | Added delete policy and forced RLS. |

## Index Audit

Required indexes are present or added:

- `user_id`
- `conversation_id`
- `created_at`

Added/confirmed:

- `creator_profiles_user_id_idx`
- `creator_profiles_created_at_idx`
- `conversations_user_id_idx`
- `conversations_created_at_idx`
- `conversations_user_created_at_idx`
- `messages_user_id_idx`
- `messages_conversation_id_idx`
- `messages_created_at_idx`
- `messages_conversation_created_at_idx`
- `knowledge_sources_user_id_idx`
- `knowledge_sources_created_at_idx`
- `knowledge_sources_user_created_at_idx`
- `generated_assets_user_id_idx`
- `generated_assets_conversation_id_idx`
- `generated_assets_source_message_id_idx`
- `generated_assets_created_at_idx`
- `generated_assets_user_created_at_idx`
- `usage_user_id_idx`
- `usage_created_at_idx`
- `usage_user_period_idx`

## Integrity Audit

Current posture:

- UUID primary keys are present.
- `created_at` defaults are present.
- `updated_at` triggers are present and re-created idempotently.
- User-owned tables reference `profiles(id)`.
- `profiles(id)` references `auth.users(id)` with cascade delete.
- Conversation deletion cascades messages.
- Profile deletion cascades user-owned creator data.

Hardening added:

- `messages_enforce_conversation_owner`
  - Ensures a message cannot belong to a conversation owned by another user.
  - Fills `messages.user_id` from the conversation owner if missing.
- `generated_assets_enforce_owner`
  - Ensures assets cannot reference another user's conversation.
  - Ensures assets cannot reference another user's source message.

## Policies Added

Every user-owned table now has explicit CRUD policies.

For direct ownership tables:

```sql
auth.uid() = user_id
```

For `profiles`:

```sql
auth.uid() = id
```

For `messages`:

```sql
exists (
  select 1
  from public.conversations c
  where c.id = messages.conversation_id
    and c.user_id = auth.uid()
)
```

## Test Coverage

Generated SQL tests verify:

- A user can read their own rows.
- A user cannot read another user's rows.
- A user cannot update another user's conversation.
- A user cannot delete another user's knowledge source.
- A user cannot insert a message into another user's conversation.
- Messages inherit access through conversation ownership.

Run against a disposable database:

```bash
psql "$DATABASE_URL" -f database/supabase/tests/rls_creator_os_tests.sql
```

## Remaining Risks

- Server-side connections using Supabase service role or privileged Postgres credentials can bypass RLS. This is expected for backend jobs, but every service-role query must continue deriving `user_id` from authenticated server context.
- Existing legacy tables such as `User`, `Script`, and `LibraryItem` are outside this Creator OS RLS scope. They should be retired or separately hardened before allowing direct client access.
- Storage RLS exists for `creator-knowledge`, but file paths must continue using the convention `{auth.uid()}/...`.
- RLS protects direct database access. API routes still need authentication and authorization guards, which were implemented separately in `lib/auth`.

## Recommended Improvements

- Move all remaining legacy data paths into `profiles`, `knowledge_sources`, `conversations`, `messages`, and `generated_assets`.
- Add CI that applies migrations to a temporary Supabase/Postgres database and runs `rls_creator_os_tests.sql`.
- Add periodic production checks that list tables where `relrowsecurity = false`.
- Keep privileged service-role operations small, audited, and isolated to backend-only code.
