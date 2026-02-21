# Innkwise v1

MVP scaffold for Innkwise frontend + backend APIs.

## Local setup

1. Install dependencies
```bash
npm install
```

2. Configure env
```bash
cp .env.example .env
```

3. Run Prisma
```bash
npx prisma generate
npx prisma migrate dev --name init
```

4. Start
```bash
npm run dev
```

## Quick backend smoke test

For UI wiring without JWT/DB/OpenAI, set:
```bash
MOCK_GENERATE_SCRIPT=true
```

Then call:
```bash
curl -X POST http://localhost:3000/api/generate-script \
  -H "content-type: application/json" \
  -d '{"topic":"t","audience":"a","tone":"Authoritative","length":8,"includeResearch":true,"includeCaseStudy":true}'
```

Expected:
```json
{
  "hooks": ["test"],
  "script": {
    "pattern_interrupt": "test"
  }
}
```

## API Endpoints

- `POST /api/generate-script`
- `POST /api/regenerate-hooks`
- `POST /api/rewrite-section`
- `GET /api/get-scripts`
- `POST /api/create-checkout-session`
- `POST /api/stripe-webhook`

## Deploy to Vercel

1. Push to GitHub
```bash
git add .
git commit -m "MVP frontend"
git push
```

2. Import repo in Vercel.
3. Add required env variables from `.env.example`.
4. Deploy.
