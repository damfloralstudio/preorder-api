# preorder-api

Checkout function for DAM Floral Studio's Thanksgiving pre-orders, running as a **Cloudflare Worker** on the free plan. The pre-order page on [damfloralstudio.com](https://damfloralstudio.com) sends the customer's selection here. The Worker validates it, sets prices and tax, and asks Square for a checkout link. See [DESIGN.md](DESIGN.md) for the full design.

## Files

| Path | Purpose |
|---|---|
| `src/index.js` | The Worker, serving `POST /api/checkout`: CORS, order window, Square call |
| `lib/order.js` | Products, prices, limits, pickup slots, tax, and the Square request body |
| `wrangler.toml` | Cloudflare Worker configuration (name, entry point, logging) |
| `test/checkout.test.js` | Tests, run with `npm test` (no dependencies; Node 20+) |
| `DESIGN.md` | End-to-end design |

## Deploying on Cloudflare

1. **Connect GitHub as the business account.** Open a private or incognito window and sign in to GitHub as `damfloralstudio`, then sign in to Cloudflare in the same window. This makes sure Cloudflare's GitHub app is installed on `damfloralstudio` and not on your personal GitHub.
2. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository**. Connect GitHub when asked, granting access to `preorder-api` only, and select `damfloralstudio/preorder-api`.
3. Keep the defaults: project name `preorder-api`, no build command, deploy command `npx wrangler deploy`. Choose **Deploy**.
4. Open the Worker → **Settings → Variables and Secrets** and add:

   | Name | Type | Sandbox phase | Live |
   |---|---|---|---|
   | `SQUARE_ACCESS_TOKEN` | **Secret** | Sandbox access token | Production access token |
   | `SQUARE_ENV` | Text | `sandbox` | `production` |
   | `SQUARE_LOCATION_ID` | Text | `LGNJTM59K97VM` | `LRE7GZ33WEFC6` |
   | `ALLOWED_ORIGINS` | Text | `https://damfloralstudio.com,http://localhost:8000` | `https://damfloralstudio.com` |
   | `PREORDER_OPENS` | Text | `2026-11-08T00:00:00-05:00` (early, so testing can start right away) | `2026-11-09T00:00:00-05:00` |
   | `PREORDER_CLOSES` | Text | `2026-11-15T23:59:59-05:00` | same |
   | `PICKUP_FULFILLMENT` | Text | leave unset | leave unset, or `off` (see below) |

   Access tokens come from the Square Developer Console: your application → **Credentials**, with the Sandbox / Production toggle. **Enter tokens only in Cloudflare, as a Secret.** Never commit them or paste them anywhere else.
5. Save and deploy. The endpoint is `https://preorder-api.<your-subdomain>.workers.dev/api/checkout`. The `workers.dev` address is shown on the Worker's overview page.

Every push to `main` deploys a new version automatically. Variables set in the dashboard are kept across deploys (`keep_vars` in `wrangler.toml`).

## Switches

- **Stop orders immediately:** set `PREORDER_CLOSES` to a past time and deploy. Every checkout attempt then returns `preorders_closed`, and the page shows the closed message.
- **Pickup fallback:** if Square rejects the pickup fulfillment (design test T1), set `PICKUP_FULFILLMENT=off` and deploy. Orders are then created without Square's pickup fields. The pickup day stays in each item name and the customer's name stays in the payment note.

## Quick check from a terminal

```bash
curl -i -X POST https://preorder-api.<your-subdomain>.workers.dev/api/checkout \
  -H 'Origin: https://damfloralstudio.com' \
  -H 'Content-Type: application/json' \
  -d '{"items":{"bouquet":1},"pickup":"tue","name":"Test Customer"}'
```

A `200` response with `{"url": "https://sandbox.square.link/..."}` means the Worker and Square credentials work. Open the URL to see the checkout page. In sandbox, pay with Square's test card `4111 1111 1111 1111` (any future expiry, CVV and ZIP).

Errors are listed in DESIGN.md §6. Square's error details are written to the Worker's logs (**Worker → Observability / Logs**) and never sent to the browser.

## Local development (optional)

```bash
npm test                     # unit tests
npx wrangler dev             # run the Worker locally on http://localhost:8787
```

For `wrangler dev`, put the variables above in a `.dev.vars` file (ignored by git).
