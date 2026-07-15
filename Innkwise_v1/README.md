# Innkwise v1

Innkwise is organized as a modular Next.js application. Next still owns the framework entrypoints, but app logic lives in separated domain folders.

## Architecture

- `app/`: Next App Router entrypoints only. These files should stay thin and import screens from `frontend/`.
- `pages/api/`: Public API route adapters only. These files should stay thin and export handlers from `backend/api/`.
- `frontend/`: UI screens, client components, browser auth token storage, and frontend-only helpers.
- `backend/`: API handlers, auth, billing, analytics, script storage, and server-side application services.
- `llm-rag/`: LLM providers, prompt builders, and future RAG retrieval/generation modules.
- `database/`: Prisma schema/client and local development repositories.
- `shared/`: Cross-boundary TypeScript types.
- `data/`: Local runtime data only. `data/users.json` is ignored and must not be committed.

Flow:

```text
frontend screens -> /api/* -> backend/api handlers -> backend services -> llm-rag + database
```

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run prisma:generate
npm run dev
```

For Google sign-in in local development, keep these values aligned with the port you run:

```bash
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

If you use a different port, update both `NEXTAUTH_URL` and the Google OAuth redirect URI.

## Database

Prisma now lives in `database/prisma`.

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```

Supabase bootstrap SQL lives at `database/prisma/supabase-init.sql`. Supabase-native migrations live in `database/supabase/migrations`.

Apply the billing migration before enabling Lemon Squeezy checkout:

```bash
supabase db push
```

or paste/run:

```text
database/supabase/migrations/202607040001_billing_system_v1.sql
```

The billing migration creates `plans`, `pricing_cohorts`, `subscriptions`, and `webhook_logs`, enables RLS, and installs the atomic `claim_founding_creator_slot()` function used by webhooks.

## Billing

Innkwise billing uses Lemon Squeezy with one product and multiple variants. Variant IDs must stay in server environment variables and must not be sent from the browser.

Required variables:

```bash
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_PRODUCT_ID=
LEMON_FOUNDER_INDIA_VARIANT_ID=
LEMON_CREATOR_INDIA_VARIANT_ID=
LEMON_FOUNDER_GLOBAL_VARIANT_ID=
LEMON_CREATOR_GLOBAL_VARIANT_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=
```

Webhook URL:

```text
https://your-domain.com/api/billing/webhook
```

Handled Lemon Squeezy events:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_payment_success`
- `subscription_payment_failed`
- `subscription_expired`

Pricing is selected on the backend from `x-vercel-ip-country`. India receives INR plans, all other countries fall back to Global pricing. Founding Creator closes automatically when `pricing_cohorts.claimed_slots` reaches `max_slots`.

## Backend Smoke Test

For UI wiring without JWT/DB/LLM services, set:

```bash
MOCK_GENERATE_SCRIPT=true
```

Then call:

```bash
curl -X POST http://localhost:3000/api/generate-script \
  -H "content-type: application/json" \
  -d '{"topic":"t","audience":"a","tone":"Authoritative","length":8,"includeResearch":true,"includeCaseStudy":true}'
```

## API Endpoints

- `POST /api/auth/continue`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/generate-script`
- `POST /api/regenerate-hooks`
- `POST /api/rewrite-section`
- `POST /api/generate-thumbnail`
- `GET /api/get-scripts`
- `POST /api/track-event`
- `POST /api/create-checkout-session`
- `POST /api/stripe-webhook`
- `GET /api/billing/pricing`
- `GET /api/billing/subscription`
- `POST /api/billing/checkout`
- `POST /api/billing/webhook`

## Deploy To Vercel

1. Push to GitHub.
2. Import the repo in Vercel.
3. Add required env variables from `.env.example`.
4. Deploy.
