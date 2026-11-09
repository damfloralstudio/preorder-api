# preorder-api

Checkout function for DAM Floral Studio's Thanksgiving pre-orders. The pre-order page on [damfloralstudio.com](https://damfloralstudio.com) sends the customer's selection here. The function validates it, sets prices and tax, and asks Square for a checkout link. See [DESIGN.md](DESIGN.md) for the full design.

## Files

| Path | Purpose |
|---|---|
| `api/checkout.js` | The endpoint, `POST /api/checkout`: CORS, order window, Square call |
| `lib/order.js` | Products, prices, limits, pickup slots, tax, and the Square request body |
| `test/checkout.test.js` | Tests, run with `npm test` (no dependencies; Node 20+) |
| `DESIGN.md` | End-to-end design |

## Deploying on Vercel

1. In Vercel, choose **Add New → Project** and import `damfloralstudio/preorder-api`. Leave the framework preset as **Other** and keep the default build settings.
2. Under **Settings → Environment Variables**, add these for the **Production** environment:

   | Variable | Sandbox phase | Live |
   |---|---|---|
   | `SQUARE_ENV` | `sandbox` | `production` |
   | `SQUARE_ACCESS_TOKEN` | Sandbox access token | Production access token |
   | `SQUARE_LOCATION_ID` | `LGNJTM59K97VM` | `LRE7GZ33WEFC6` |
   | `ALLOWED_ORIGINS` | `https://damfloralstudio.com,http://localhost:8000` | `https://damfloralstudio.com` |
   | `PREORDER_OPENS` | `2026-11-09T00:00:00-05:00` | same |
   | `PREORDER_CLOSES` | `2026-11-15T23:59:59-05:00` | same |
   | `PICKUP_FULFILLMENT` | leave unset | leave unset, or `off` (see below) |

   Access tokens come from the Square Developer Console: your application → **Credentials**, with the Sandbox / Production toggle. **Enter tokens only in Vercel.** Never commit them or paste them anywhere else.
3. After changing environment variables, redeploy (**Deployments → ⋯ → Redeploy**) so the function picks them up.
4. The endpoint is `https://<project-domain>/api/checkout`. The project domain is shown on the Vercel project page.

Pushing to `main` deploys to production. Pushing any other branch creates a preview deployment with its own URL.

## Switches

- **Stop orders immediately:** set `PREORDER_CLOSES` to a past time and redeploy. Every checkout attempt then returns `preorders_closed`, and the page shows the closed message.
- **Pickup fallback:** if Square rejects the pickup fulfillment (design test T1), set `PICKUP_FULFILLMENT=off` and redeploy. Orders are then created without Square's pickup fields. The pickup day stays in each item name and the customer's name stays in the payment note.

## Quick check from a terminal

```bash
curl -i -X POST https://<project-domain>/api/checkout \
  -H 'Origin: https://damfloralstudio.com' \
  -H 'Content-Type: application/json' \
  -d '{"items":{"bouquet":1},"pickup":"tue","name":"Test Customer"}'
```

A `200` response with `{"url": "https://sandbox.square.link/..."}` means the function and Square credentials work. Open the URL to see the checkout page. In sandbox, pay with Square's test card `4111 1111 1111 1111` (any future expiry, CVV and ZIP).

Errors are listed in DESIGN.md §6. Square's error details are written to the Vercel logs (**Project → Logs**) and never sent to the browser.
