# Hearth & Hound

A premium dog-wellness storefront (calming + orthopedic comfort) with **Stripe**
checkout and **automated CJdropshipping** fulfillment, deployed on **Vercel**.

```
hearth-and-hound/
├── index.html              # storefront (reads products.json for display)
├── products.json           # SINGLE SOURCE OF TRUTH: catalog + prices + CJ variant IDs
├── api/
│   ├── checkout.js         # POST /api/checkout  -> creates a Stripe Checkout Session
│   ├── webhook.js          # POST /api/webhook   -> on payment, places the CJ order
│   └── _lib/
│       ├── catalog.js      # loads products.json -> server-authoritative prices/VIDs
│       └── cj.js           # CJdropshipping API client
├── scripts/
│   ├── import-cj.js        # pulls CJ product data + photos into products.json
│   └── import.config.example.json  # copy to import.config.json and list your CJ pids
├── package.json
├── .env.example            # copy to .env.local and fill in
└── .gitignore
```

## How it works

1. Customer fills the cart in the browser and clicks **Checkout**.
2. The browser sends only `{ id, qty }` to `/api/checkout`. The server looks up the
   **real prices** from `api/_lib/catalog.js` (the browser can never set the price),
   creates a Stripe Checkout Session, and redirects the customer to Stripe to pay.
3. Stripe processes payment and calls `/api/webhook`. The webhook verifies Stripe's
   signature, reads the shipping address Stripe collected, maps each item to its
   **CJ variant ID**, and creates the order on CJdropshipping automatically.
4. CJ ships the product to the customer. You never touch inventory.

> Security: the Stripe **secret key** and the CJ **API key** live only in server-side
> environment variables. They are never sent to the browser.

---

## Setup

### 1. Install dependencies (VS Code / PowerShell terminal, in this folder)

```powershell
npm install
npm install -g vercel    # Vercel CLI, if you don't have it
```

### 2. Get your keys

**Stripe** (dashboard → Developers):
- `STRIPE_SECRET_KEY` — start with the **test** key `sk_test_...`
- `STRIPE_WEBHOOK_SECRET` — see step 4 (local) / step 6 (production)

**CJdropshipping** (My CJ → Authorization / API):
- `CJ_EMAIL` — your account email
- `CJ_API_KEY` — generate an API key

### 3. Import your products from CJ  ← automated

The catalog lives in one file, **`products.json`**, read by both the storefront and
the checkout backend. Instead of pasting variant IDs by hand, generate it from your
CJ account:

1. In CJdropshipping, find each product you want to sell and copy its **product id
   (pid)** from the URL.
2. Copy `scripts/import.config.example.json` → `scripts/import.config.json` and fill
   in each product: its `pid`, your storefront `id`, marketing copy (`name`, `desc`,
   `features`, `tag`), and either a `priceUsd` (explicit retail) or a `markup`
   (retail = CJ cost × markup). Optionally pin a specific variant with `vid`.
3. Run the importer with your CJ credentials:

```powershell
$env:CJ_EMAIL="you@example.com"; $env:CJ_API_KEY="xxxx"; node scripts/import-cj.js
```

It calls CJ's `/product/query`, then writes `products.json` with real names, photos,
prices, and variant IDs (VIDs). It only **reads** CJ — no orders, no charges. Review
the printed `cost → retail` line for each item to confirm your margins, then commit.

> Safety net: if any purchased item is missing a `cjVid`/`cjSku` at order time, the
> webhook **logs and holds** that order instead of auto-shipping — you never silently
> lose a sale, and nothing unmapped ever ships.

### 4. Run locally with test payments

Create `.env.local` from `.env.example` and fill in the values. Then:

```powershell
vercel dev
```

In a second terminal, forward Stripe webhooks to your local server and grab the
signing secret it prints (`whsec_...`) into `.env.local`:

```powershell
stripe listen --forward-to localhost:3000/api/webhook
```

Use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC. Keep
`CJ_SANDBOX=1` so CJ creates test orders. Watch the `vercel dev` console — you should
see `ORDER ... fulfilled via CJ`.

### 5. Push to GitHub (PowerShell)

```powershell
git init
git add .
git commit -m "Hearth & Hound: Stripe checkout + CJ fulfillment"
git branch -M main
gh repo create hearth-and-hound --public --source=. --remote=origin --push
```

### 6. Deploy to Vercel

```powershell
vercel --prod
```

Then in the Vercel dashboard:
- **Settings → Environment Variables**: add `STRIPE_SECRET_KEY`, `CJ_EMAIL`,
  `CJ_API_KEY`, `CJ_LOGISTIC_NAME`, `CJ_FROM_COUNTRY`, `CJ_PAY_TYPE`, and set
  `CJ_SANDBOX=0` for real orders.
- **Stripe → Developers → Webhooks**: add an endpoint
  `https://hearth-hound.com/api/webhook`, subscribe to `checkout.session.completed`,
  copy its signing secret into Vercel as `STRIPE_WEBHOOK_SECRET`, then redeploy.

### 7. Go live
- Swap Stripe test keys for **live** keys (`sk_live_...`) and a live webhook secret.
- Set `CJ_SANDBOX=0` and fund your CJ balance (with `CJ_PAY_TYPE=2`, CJ auto-charges
  your balance per order). Use `CJ_PAY_TYPE=3` if you'd rather pay each order by hand.

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe | Server-side payment API key |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Verifies webhook authenticity |
| `CJ_EMAIL` | CJ | Account email for API auth |
| `CJ_API_KEY` | CJ | API key for API auth |
| `CJ_LOGISTIC_NAME` | CJ | Shipping method (e.g. `CJPacket Ordinary`) |
| `CJ_FROM_COUNTRY` | CJ | Warehouse origin, 2-letter code (e.g. `CN`) |
| `CJ_PAY_TYPE` | CJ | `2` = auto-pay from balance, `3` = create only |
| `CJ_SANDBOX` | CJ | `1` = test orders, `0` = real orders |

## Notes & limitations
- **Shipping/tax**: a simple flat/free rule lives in `catalog.js`. For true real-time
  CJ shipping rates you'd call CJ's freight endpoint in `checkout.js` before creating
  the session — a sensible next iteration.
- **Logistics name** is currently a fixed default. CJ exposes a freight-options call to
  pick the cheapest valid method per destination; wire that in when you're ready.
- **Token caching**: the CJ access token is cached in memory per serverless instance.
  Fine for low/medium volume; for high volume, store it in Vercel KV.

© 2026 Hearth & Hound
