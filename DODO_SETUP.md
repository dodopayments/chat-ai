# Dodo Payments Dashboard Setup

This guide walks through getting all four environment variables needed to run
credit-based billing in this app.

```
DODO_API_KEY
DODO_WEBHOOK_SECRET
DODO_PRODUCT_ID
DODO_CREDIT_ENTITLEMENT_ID
```

---

## 1. API Key — `DODO_API_KEY`

**Where:** Dashboard → top-right avatar → API Keys → Create Key

**What it is:** The bearer token that authenticates every server-side API call
from your app to Dodo — creating checkout sessions, fetching balances, sending
usage events.

**Copy the value** and set it as `DODO_API_KEY` in `.env`.

---

## 2. Webhook Secret — `DODO_WEBHOOK_SECRET`

**Where:** Dashboard → Webhooks → Add Endpoint

**What it is:** A signing secret Dodo attaches to every webhook payload it sends
to your server. Your app uses it to verify the request actually came from Dodo
and was not tampered with.

**Fields to fill:**
- **URL** — your public endpoint, e.g. `https://<ngrok>.ngrok-free.app/api/webhooks/dodo`
  (use ngrok locally; replace with your production URL on deploy)
- **Events to subscribe** — select:
  - `subscription.active`
  - `credit.added`
  - `credit.balance_low`
  - `credit.overage_charged`

After saving, reveal the **Signing Secret** and set it as `DODO_WEBHOOK_SECRET`.

---

## 3. Meter (prerequisite for credits)

**Where:** Dashboard → Usage Billing → Meters → New Meter

**What it is:** A meter defines the unit you will track usage in. Every usage
event your app fires must reference this meter by name.

**Fields:**
- **Meter Name** — `AI Tokens` (display name, your choice)
- **Event Name** — `ai.tokens` (this is the string your code sends in
  `dodo.usageEvents.ingest({ events: [{ event_name: 'ai.tokens' }] })`)
- **Aggregation** — `SUM` (accumulate token counts across events)
- **Over Property** — `tokens` (the key inside your event's `metadata` object
  that holds the numeric value)
- **Measurement Unit** — `Tokens` (label shown in the dashboard)

No ID is needed from this step — it feeds into the next step.

---

## 4. Credit Entitlement — `DODO_CREDIT_ENTITLEMENT_ID`

**Where:** Dashboard → Usage Billing → Credits → New Credit

**What it is:** A credit pool linked to the meter above. When a user subscribes,
they receive a bucket of credits. Each usage event drawn from the meter drains
this bucket. Your app queries this entitlement to show the user their remaining
balance.

**Fields:**
- **Name** — `AI Tokens` (matches the meter, keeps things clear)
- **Linked Meter** — select the `AI Tokens` meter you just created
- **Credits Per Cycle** — `10000` (tokens granted each billing period)
- **Expiry** — `30 days` (credits reset monthly with the subscription)
- **Low Balance Threshold (%)** — `20` (Dodo fires a `credit.balance_low`
  webhook when 2,000 tokens remain, so the app can warn the user)

After saving, **copy the `cde_...` ID** and set it as `DODO_CREDIT_ENTITLEMENT_ID`.

---

## 5. Product — `DODO_PRODUCT_ID`

**Where:** Dashboard → Products → Add New Product

**What it is:** The subscription plan customers purchase. It defines the price,
billing interval, and what the subscriber receives — in this case the credit
entitlement above.

**Fields:**
- **Product Name** — e.g. `Chat AI Pro`
- **Pricing Type** — `Recurring` (monthly subscription, not one-time)
- **Price** — your chosen amount, e.g. `$9.99 / month`
- **Entitlements section → Credits → Attach** — attach the `AI Tokens` credit:
  - Credits issued per billing cycle: `10000`
  - Low Balance Threshold (%): `20`
  - Allow proration: off

After clicking **Add Product**, **copy the `prod_...` ID** and set it as
`DODO_PRODUCT_ID`.

---

## Summary — `.env` after setup

```env
DODO_API_KEY="BELAC..."
DODO_WEBHOOK_SECRET="whsec_..."
DODO_PRODUCT_ID="prod_..."
DODO_CREDIT_ENTITLEMENT_ID="cde_..."
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

---

## How these wire together at runtime

1. User clicks Subscribe → app calls `POST /api/billing/checkout` → creates a
   Dodo checkout session for `DODO_PRODUCT_ID` with `metadata.user_id` embedded.
2. User completes payment → Dodo fires `subscription.active` webhook → app reads
   `metadata.user_id`, stores the Dodo customer ID against the user in the DB.
3. User sends a chat message → app streams the AI response → on completion fires
   `dodo.usageEvents.ingest` with `event_name: 'ai.tokens'` and the token count.
4. Dodo deducts tokens from the credit balance. When balance hits 20%, Dodo fires
   `credit.balance_low` → app sets a flag → UI shows a warning banner.
5. Balance page calls `GET /api/billing/balance` → app fetches live balance via
   `dodo.creditEntitlements.balances.retrieve` using `DODO_CREDIT_ENTITLEMENT_ID`.
