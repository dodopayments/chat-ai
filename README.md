# Chat AI

A full-stack AI chat application with multi-model support and credit-based billing.
Users subscribe to a monthly plan, receive a credit allowance, and spend credits as they chat.
Built as a reference implementation for integrating Dodo Payments usage-based billing into a Next.js app.

## What it does

- Sign up / sign in with email and password
- Choose from four AI models in a dropdown and chat with streaming responses
- Subscription required to chat — users are redirected to a pricing page if they have no active plan
- Token balance shown in the header, deducted after every message
- Amber warning banner when balance is running low
- Input blocked and subscribe prompt shown when balance hits zero

## Models

Served via Fireworks AI:

| Name | Model ID |
|---|---|
| DeepSeek V3.1 | `accounts/fireworks/models/deepseek-v3p1` |
| GPT-OSS 20B | `accounts/fireworks/models/gpt-oss-20b` |
| Kimi K2 Thinking | `accounts/fireworks/models/kimi-k2-thinking` |
| Qwen3 VL 30B | `accounts/fireworks/models/qwen3-vl-30b-instruct` |

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | SQLite via Prisma 6 |
| Auth | bcryptjs + JWT (jose) stored in httpOnly cookies |
| AI | Fireworks AI via OpenAI-compatible SDK |
| Billing | Dodo Payments — credit-based usage billing |

## Project Structure

```
src/
  app/
    api/
      auth/
        signin/       # POST — email/password login
        signup/       # POST — register new user
      billing/
        checkout/     # POST — creates Dodo checkout session
        balance/      # GET  — returns current credit balance
      chat/           # POST — proxies to Fireworks AI, fires usage event after stream
      webhooks/
        dodo/         # POST — handles subscription.active, credit.* events from Dodo
    auth/
      signin/         # Sign in page
      signup/         # Sign up page
    pricing/          # Pricing page with subscribe button
    page.tsx          # Chat page (protected)
  components/
    Chat.tsx          # Main chat UI with balance display and input blocking
  lib/
    auth.ts           # JWT helpers, cookie helpers, password hashing
    db.ts             # Prisma singleton
    dodo.ts           # Dodo Payments SDK singleton
  proxy.ts            # Next.js 16 route protection (replaces middleware.ts)
prisma/
  schema.prisma       # User model with dodo_customer_id and balance_low fields
```

## Getting Started

### 1. Clone the repo

```bash
git clone <repo-url>
cd chat-ai
npm install
```

### 2. Set up environment variables

Create a `.env` file in the root:

```env
# Database
DATABASE_URL="file:./prisma/dev.db"

# Auth
JWT_SECRET="your-secret-key"

# Fireworks AI
FIREWORKS_API_KEY="fw_..."

# Dodo Payments
DODO_API_KEY=""
DODO_WEBHOOK_SECRET=""
DODO_PRODUCT_ID=""
DODO_CREDIT_ENTITLEMENT_ID=""

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

See `DODO_SETUP.md` for step-by-step instructions on getting the four Dodo values
from the dashboard.

### 3. Set up the database

```bash
npx prisma db push
```

### 4. Run the dev server

```bash
npm run dev
```

Open `http://localhost:3000`.

### 5. Test billing locally

You need a public URL for Dodo to send webhooks to your local machine:

```bash
ngrok http 3000
```

Update the webhook endpoint URL in the Dodo dashboard to:
```
https://<your-ngrok-id>.ngrok-free.app/api/webhooks/dodo
```

Use test card `4242 4242 4242 4242` exp `06/32` CVV `123` on the checkout page.

## Billing Integration

For a detailed breakdown of every file and code change involved in the billing
integration, see `BILLING.md`.

## Adding a New Model

All models are served through Fireworks AI. Adding one takes a single file change.

**1. Find the model ID on Fireworks**

Go to fireworks.ai, browse the model library, and copy the full model ID.
It will look like `accounts/fireworks/models/<model-name>`.

**2. Add it to the `MODELS` array in `src/components/Chat.tsx`**

```ts
const MODELS = [
  { id: 'accounts/fireworks/models/deepseek-v3p1', name: 'DeepSeek V3.1' },
  { id: 'accounts/fireworks/models/gpt-oss-20b', name: 'GPT-OSS 20B' },
  { id: 'accounts/fireworks/models/kimi-k2-thinking', name: 'Kimi K2 Thinking' },
  { id: 'accounts/fireworks/models/qwen3-vl-30b-a3b-instruct', name: 'Qwen3 VL 30B' },
  // add your model here
  { id: 'accounts/fireworks/models/<your-model-id>', name: 'Your Model Name' },
];
```

The `id` is sent directly to the Fireworks API. The `name` is what appears in the
dropdown. No other changes needed — the chat route, streaming, and credit tracking
all work the same regardless of which model is selected.

## Notes

- Chat history is stored in `localStorage` only — it is not persisted to the database
- The Dodo SDK is initialised with `environment: 'test_mode'` — change to `live_mode` for production
- Switch branches rule: whenever `prisma/schema.prisma` differs between branches,
  run `npx prisma generate` after switching to avoid stale Prisma client errors
