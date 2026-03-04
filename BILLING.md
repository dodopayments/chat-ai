# Credit-Based Billing with Dodo Payments

This document covers every code change made to add credit-based billing to the chat app.

## Overview

Users must subscribe to chat. Each subscription grants 10,000 credits per month.
Every AI response deducts credits equal to the token count returned by Fireworks AI.
When credits run out, the chat input is blocked until the user resubscribes.

## Environment Variables

```env
DODO_API_KEY=""                  # Bearer token for Dodo API calls
DODO_WEBHOOK_SECRET=""           # Signing secret to verify incoming webhooks
DODO_PRODUCT_ID=""               # The prod_... ID of your usage-based billing product
DODO_CREDIT_ENTITLEMENT_ID=""    # The cde_... ID of your credit entitlement
NEXT_PUBLIC_APP_URL=""           # Your app's base URL (used for checkout return_url)
```

---

## Files Added

### `src/lib/dodo.ts`

Singleton instance of the Dodo Payments SDK, following the same pattern as the
Prisma singleton. Prevents multiple instances during Next.js hot reloads in dev.

```ts
export const dodo = new DodoPayments({
  bearerToken: process.env.DODO_API_KEY,
  webhookKey: process.env.DODO_WEBHOOK_SECRET,  // used for webhook signature verification
  environment: 'test_mode',                      // switch to 'live_mode' for production
});
```

---

### `src/app/api/billing/checkout/route.ts`

Creates a Dodo checkout session when the user clicks Subscribe.

The key detail is `metadata: { user_id }`. Dodo echoes this back inside the
`subscription.active` webhook payload. This is the only way to know which local
user completed the payment, since the webhook comes server-to-server with no
cookie or session.

```ts
const checkoutSession = await dodo.checkoutSessions.create({
  product_cart: [{ product_id: process.env.DODO_PRODUCT_ID!, quantity: 1 }],
  customer: { email: session.email },
  return_url: `${appUrl}/?subscription=success`,
  metadata: { user_id: session.userId },
});
```

Returns `checkout_url` to the client, which redirects the browser to Dodo's
hosted payment page.

---

### `src/app/api/billing/balance/route.ts`

Returns the user's current token balance and subscription status.

- If `dodo_customer_id` is not set on the user → returns `subscribed: false` immediately, no Dodo API call needed.
- If set → calls `dodo.creditEntitlements.balances.retrieve()` for a live count.
- `balance_low` is read from the local DB (set by the webhook handler) rather than from Dodo, to avoid an extra API call on every page load.

Note: the SDK returns `balance` as a string, so `parseFloat()` is required.

```ts
const balanceData = await dodo.creditEntitlements.balances.retrieve(
  user.dodo_customer_id,
  { credit_entitlement_id: process.env.DODO_CREDIT_ENTITLEMENT_ID! },
);
return { balance: parseFloat(balanceData.balance), subscribed: true, balance_low: user.balance_low };
```

---

### `src/app/api/webhooks/dodo/route.ts`

Receives and processes events from Dodo. All four subscribed events are handled here.

**Signature verification** happens first. The raw body (not parsed JSON) is passed
to `dodo.webhooks.unwrap()` along with the request headers converted to a plain
object. Next.js `Headers` is not a plain record, so a manual conversion is needed.

```ts
const headers: Record<string, string> = {};
request.headers.forEach((value, key) => { headers[key] = value; });
payload = dodo.webhooks.unwrap(rawBody, { headers });
```

**Event handling:**

| Event | Action |
|---|---|
| `subscription.active` | Reads `metadata.user_id` and `customer.customer_id` from the payload, writes `dodo_customer_id` to the user in the DB — this is the moment the user becomes a subscriber |
| `credit.added` | Clears `balance_low` flag — tokens were refilled |
| `credit.balance_low` | Sets `balance_low = true` — triggers a warning banner in the UI |
| `credit.overage_charged` | Logged only |

The handler always returns `200 OK` even if the DB update fails. Returning a
`5xx` would cause Dodo to retry the webhook indefinitely.

---

### `src/app/pricing/page.tsx`

Client page that shows the plan details and a Subscribe button.

On click, calls `POST /api/billing/checkout` and redirects the browser to
`checkout_url`. Redirects to `/auth/signin` if the user is not logged in.

---

## Files Modified

### `prisma/schema.prisma`

Two fields added to the `User` model:

```prisma
dodo_customer_id String?                   // null = no subscription
balance_low      Boolean @default(false)   // true = warning banner shown in UI
```

`dodo_customer_id` is the join key between your DB user and the Dodo customer.
Every billing API call uses this ID. It is set once when `subscription.active`
fires and never changes.

---

### `src/proxy.ts`

Two routes added to the public allowlist:

```ts
const PUBLIC_PAGES = ['/pricing'];
const PUBLIC_API  = [..., '/api/webhooks/dodo'];
```

`/pricing` must be accessible without a login so users can see the plan before
signing up. `/api/webhooks/dodo` must be public because Dodo calls it with no
cookie — it authenticates via HMAC signature instead.

---

### `src/app/api/chat/route.ts`

**Subscription gate** — added before reading the request body so unauthenticated
requests are rejected cheaply:

```ts
const user = await prisma.user.findUnique({ where: { id: session.userId } });
if (!user?.dodo_customer_id) {
  return NextResponse.json({ error: 'subscription_required' }, { status: 402 });
}
```

**Usage tracking** — added `stream_options: { include_usage: true }` to the
Fireworks request. This makes the final stream chunk include `usage.total_tokens`.
After the stream closes, a usage event is fired to Dodo:

```ts
dodo.usageEvents.ingest({
  events: [{
    event_id: `chat_${session.userId}_${Date.now()}`,
    customer_id: dodoCustomerId,
    event_name: 'ai.tokens',
    timestamp: new Date().toISOString(),
    metadata: { tokens: String(totalTokens), model },
  }],
});
```

The `event_name` must match the **Event Name** configured on the meter in the
Dodo dashboard (`ai.tokens`). The `metadata.tokens` key must match the
**Over Property** field on the meter (`tokens`).

---

### `src/components/Chat.tsx`

Three UI additions:

**Balance pill** — calls `GET /api/billing/balance` on mount and after every
message. Displays the credit count in the header. If not subscribed, shows a
"0 credits — Subscribe" link.

**Low balance banner** — amber warning bar shown when `balance_low === true`.
Prompts the user to visit the pricing page before they run out completely.

**Input blocking** — `isBlocked` is `true` when `!subscribed || balance <= 0`.
When blocked: input is disabled, placeholder changes to "Subscribe to send
messages", and a "Subscribe to continue" link appears above the form.

---

## Data Flow

```
User clicks Subscribe
  → POST /api/billing/checkout
  → Dodo checkout page (with metadata.user_id embedded)
  → User pays
  → Dodo fires subscription.active webhook
  → POST /api/webhooks/dodo
  → dodo_customer_id saved to DB user

User sends a message
  → POST /api/chat
  → subscription gate checks dodo_customer_id
  → Fireworks streams response with include_usage: true
  → stream closes, total_tokens captured
  → dodo.usageEvents.ingest fires (deducts from credit balance)
  → fetchBalance() re-runs in UI, header updates

Balance hits 20% threshold
  → Dodo fires credit.balance_low webhook
  → balance_low = true saved to DB
  → amber warning banner shown on next render

Balance hits 0
  → isBlocked = true
  → input disabled, subscribe prompt shown
```
