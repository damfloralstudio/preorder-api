# Thanksgiving Pre-orders: Checkout Design

| | |
|---|---|
| **Status** | Approved |
| **Last updated** | 2026-11-09 |
| **Repositories** | `damfloralstudio/home` (website), `damfloralstudio/preorder-api` (checkout function) |
| **Pre-order window** | Mon Nov 9, 12:00am – Sun Nov 15, 11:59pm (Eastern) |

## 1. Summary

DAM Floral Studio is taking Thanksgiving pre-orders for one week. Customers choose products, a pickup time and their name on **damfloralstudio.com**. They pay on a **Square-hosted checkout page** branded with the studio's logo. A small **Cloudflare Worker** (free plan) connects the two. It holds the Square credentials, sets prices and builds the order, so neither prices nor secrets ever reach the browser. Square's Dashboard is the source of truth for orders and payments. Umami Cloud provides basic page analytics to compare visits, checkout clicks and payments.

## 2. Goals and non-goals

**Goals**
- Customers can pre-order Thanksgiving Bouquets ($50) and Thanksgiving Arrangements ($60) for pickup at Bwè Kafe.
- The experience stays on-brand. Only the payment step happens on Square.
- Prices, quantity limits and the order window are enforced on the server.
- The studio gets a clear pickup list from the Square Dashboard.
- A simple funnel: visits → started an order → clicked checkout → paid.

**Non-goals**
- Delivery. This is pickup only.
- Customer accounts, or enforcing limits per person across several orders.
- A total capacity cap (no inventory counter).
- Building our own payment form or handling card data.

## 3. Key facts

| Item | Value |
|---|---|
| Products | **Thanksgiving Bouquet**: $50.00, max 3 per order · **Thanksgiving Arrangement**: $60.00, max 2 per order |
| Product photos | `assets/thanksgiving_bouquet.jpg`, `assets/thanksgiving_arrangement.jpg` |
| Pickup location | Bwè Kafe – Washington St., 1002 Washington St, Hoboken, NJ 07030 |
| Pickup slots | **Tue Nov 24, 9am–5pm** · **Wed Nov 25, 9am–12pm** |
| Order window | Opens `2026-11-09T00:00:00-05:00` · Closes `2026-11-15T23:59:59-05:00` |
| Sales tax | NJ sales tax added on top at checkout, 6.625% (rate to be confirmed, see §14) |
| Payments | Square, Free plan, Checkout API (payment links) |
| Contact | damfloralstudio@gmail.com |

## 4. Architecture

### Components

| Component | What it is | Its job | What it never does |
|---|---|---|---|
| **Website** (`damfloralstudio.com`) | Static site on GitHub Pages | Shows products and collects quantities, pickup slot and name | Holds the Square token, sets prices or takes payment |
| **Checkout function** (`preorder-api` on Cloudflare Workers) | One serverless endpoint, `POST /api/checkout` | Validates the request, sets prices and tax, builds the Square order, returns a checkout link | Shows pages to customers or stores customer data |
| **Square** | Payment provider | Hosts the payment page, takes payment, emails receipts, records the order | Knows anything about the website |
| **Umami Cloud** | Cookie-free analytics | Counts page views and checkout funnel events | Receives names, emails or payment details |

### How one order flows

Example: a customer orders 2 bouquets for Tuesday pickup.

1. The customer opens `damfloralstudio.com/thanksgiving.html`, served by GitHub Pages.
2. They choose 2 bouquets and Tuesday, enter their name, and click **Continue to secure checkout**.
3. The website sends the checkout function only the choices: `2 bouquets, pickup tue, name`.
4. The function checks that the window is open, quantities are within limits, and the slot and name are valid. It adds what only it knows: prices, tax, the exact pickup time and the pickup note.
5. The function calls Square's `CreatePaymentLink` with the secret token.
6. Square creates a draft order and returns a single-use checkout link.
7. The function returns that link to the website.
8. The website sends the browser to the Square checkout page, which shows the studio's logo and colors.
9. The customer pays on Square. Card details go only to Square.
10. Square collects the customer's email and phone on its checkout page, redirects the customer to `damfloralstudio.com/thanksgiving-thanks.html` and emails a receipt. The studio gets a "payment received" email.
11. The paid order appears in **Square Dashboard → Orders** with the items, pickup time and name.

**Who talks to whom**
- Website ↔ function: one request and one response (steps 3 and 7).
- Function ↔ Square: one request and one response (steps 5 and 6).
- Customer ↔ Square: the payment (steps 8–10).
- Website ↔ Square: never directly.

## 5. Customer experience

### 5.1 Homepage entry point
A seasonal button in the hero, **"Thanksgiving pre-orders, through Sun Nov 15"**, linking to `thanksgiving.html`. A script hides it automatically once the window closes, so it never needs removing by hand.

### 5.2 `thanksgiving.html`
Uses the existing site's fonts, colors and header/footer. Top to bottom:

1. **Headline and intro.** Pre-order Thanksgiving flowers for pickup in Hoboken.
2. **Two product cards.** Each has a photo, name, price, description and a − / + quantity stepper starting at 0. The + button disables at the max: 3 bouquets, 2 arrangements.
3. **Pickup time.** Two radio options, "Tue Nov 24, 9am–5pm" and "Wed Nov 25, 9am–12pm".
4. **Pickup location.** Bwè Kafe, 1002 Washington St, Hoboken, with a map link.
5. **Your details.** *Name for pickup* (required, max 100 characters). No email field: see §5.6.
6. **Summary.** For example: "2 Thanksgiving Bouquets · Subtotal $100.00 · NJ sales tax added at checkout". The page doesn't calculate tax itself, so it can't disagree with Square by a cent.
7. **Continue to secure checkout** button. It stays disabled until there is at least one item, a pickup slot and a name. Note below it: "Payment is processed securely by Square."
8. **Policy** (wording in §5.5).
9. Footer note: "We use privacy-friendly, cookie-free analytics."

**Page states**

| State | What the customer sees |
|---|---|
| Open | The form, as above |
| Submitting | Button reads "Preparing checkout…" and is disabled |
| Error | "Something went wrong. Please try again or email damfloralstudio@gmail.com." The form stays filled in |
| Closed (after the close time, or when the function returns `preorders_closed`) | Form replaced with: **"Thanksgiving pre-orders are closed, please contact us directly at damfloralstudio@gmail.com!"** |

### 5.3 `thanksgiving-thanks.html`
"Thank you, your pre-order is confirmed! Square has emailed your receipt." Below that, the pickup address, both pickup windows and the policy. It doesn't depend on anything Square adds to the URL.

### 5.4 Product copy

**Thanksgiving Bouquet: $50**
> A hand-tied armful of autumn: glowing marigold orange, deep cranberry red, soft peach and a cheeky pop of green, wrapped and ready to hand to your host (or keep for yourself, we won't tell). **Designer's Choice:** your bouquet will match the color palette pictured, while the exact flowers will be our pick of the freshest seasonal blooms that week.

**Thanksgiving Arrangement: $60**
> The harvest, ready for the table: marigold orange, cranberry red and peach blooms with playful green accents, arranged in a seasonal vessel so all you have to do is set it down and soak up the compliments. **Designer's Choice:** your arrangement will match the color palette pictured, while the exact flowers and vase will be our pick of the freshest blooms and vessels available that week.

### 5.5 Policy wording
Shown on the pre-order page, on the thank-you page, and in the Square checkout policies (§10.1):

> To cancel a pre-order, please submit a refund request to damfloralstudio@gmail.com before 11:59pm on Sunday, November 15th. We apologize in advance that we will not be able to honor any refund requests submitted after 11:59pm on Sunday, November 15th. We also cannot guarantee product availability for any products not picked up before 12:00pm on Wednesday, November 25th.

### 5.6 Decision: no email field on our page
Square's checkout page always asks for the customer's email and phone, sends the receipt there, and adds them to the order's pickup recipient after payment. We decided not to ask for email on our page:
- **Shorter form:** customers enter only what Square doesn't collect, which is quantities, pickup slot and name.
- **Feels more official:** customers give contact details on Square's payment page, where they expect to, rather than on our page.
- **No conflicting data:** a customer can't enter one email on our page and a different one on Square's.

Trade-off: we give up pre-filling the email on Square's page (`pre_populated_data.buyer_email`). The email still reaches the Square order, so nothing is lost for operations.

## 6. API contract: website ↔ checkout function

```
POST https://preorder-api.<subdomain>.workers.dev/api/checkout
Content-Type: application/json

{
  "items":  { "bouquet": 2, "arrangement": 0 },
  "pickup": "tue",
  "name":   "Jane Doe"
}
```

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ "url": "https://square.link/u/..." }` | Redirect the browser to `url` |
| 204 | (empty) | Answer to an `OPTIONS` CORS preflight |
| 400 | `{ "error": "invalid_request" \| "empty_order" \| "invalid_quantity" \| "invalid_pickup" \| "invalid_name" }` | Bad input (`invalid_request` means malformed JSON) |
| 403 | `{ "error": "preorders_closed" }` | Outside the order window |
| 404 | `{ "error": "not_found" }` | Any path other than `/api/checkout` |
| 405 | `{ "error": "method_not_allowed" }` | Any method other than POST or OPTIONS |
| 500 | `{ "error": "server_misconfigured" }` | A required environment variable is missing or invalid |
| 502 | `{ "error": "square_error" }` | Square rejected the request or was unreachable. Details go to the Worker logs only |

The browser never sends prices, product names, pickup times or tax.

## 7. Checkout function

### 7.1 Logic
1. Handle CORS. Allow only the origins in `ALLOWED_ORIGINS`, and answer `OPTIONS` preflights.
2. Accept `POST` only.
3. **Window check:** reject with `preorders_closed` unless `PREORDER_OPENS ≤ now ≤ PREORDER_CLOSES`.
4. **Validate:**
   - Quantities must be whole numbers, bouquet 0–3 and arrangement 0–2, with at least one item in total.
   - `pickup` must be `tue` or `wed`.
   - `name` is trimmed and must be 1–100 characters.
5. **Build the order** from constants defined in the function (§7.2).
6. **Call Square** `POST /v2/online-checkout/payment-links` with a new `crypto.randomUUID()` idempotency key.
7. Return `payment_link.url`. On any Square error, log the response and return `square_error`.

**Implementation:** a Cloudflare Worker, `src/index.js` (the endpoint), and `lib/order.js` (catalog, validation and request building). It uses only web-standard APIs (`fetch`, `Request`, `Response`, `crypto.randomUUID`) with no dependencies. Tests are in `test/checkout.test.js` (`npm test`).

### 7.2 Constants

```
PRODUCTS
  bouquet:     "Thanksgiving Bouquet",     5000 cents, max 3
  arrangement: "Thanksgiving Arrangement", 6000 cents, max 2

PICKUP SLOTS                          pickup_at (UTC)          window   label
  tue: Tue Nov 24, 9am–5pm ET         2026-11-24T14:00:00Z     PT8H     "Pickup Tue 11/24"
  wed: Wed Nov 25, 9am–12pm ET        2026-11-25T14:00:00Z     PT3H     "Pickup Wed 11/25"

PICKUP NOTE  "Pickup at Bwè Kafe, 1002 Washington St, Hoboken, NJ 07030"
TAX          "NJ Sales Tax", 6.625%, ADDITIVE, scope ORDER
```

### 7.3 Square request (example: 2 bouquets, Tuesday)

```
POST {SQUARE_BASE_URL}/v2/online-checkout/payment-links
Authorization: Bearer {SQUARE_ACCESS_TOKEN}
Square-Version: 2026-09-16
Content-Type: application/json
```
```json
{
  "idempotency_key": "<uuid>",
  "order": {
    "location_id": "<SQUARE_LOCATION_ID>",
    "line_items": [
      {
        "name": "Thanksgiving Bouquet — Pickup Tue 11/24",
        "quantity": "2",
        "base_price_money": { "amount": 5000, "currency": "USD" }
      }
    ],
    "taxes": [
      { "uid": "nj-sales-tax", "name": "NJ Sales Tax", "percentage": "6.625", "type": "ADDITIVE", "scope": "ORDER" }
    ],
    "fulfillments": [
      {
        "type": "PICKUP",
        "state": "PROPOSED",
        "pickup_details": {
          "recipient": { "display_name": "Jane Doe" },
          "schedule_type": "SCHEDULED",
          "pickup_at": "2026-11-24T14:00:00Z",
          "pickup_window_duration": "PT8H",
          "note": "Pickup at Bwè Kafe, 1002 Washington St, Hoboken, NJ 07030"
        }
      }
    ]
  },
  "checkout_options": {
    "redirect_url": "https://damfloralstudio.com/thanksgiving-thanks.html",
    "merchant_support_email": "damfloralstudio@gmail.com",
    "ask_for_shipping_address": false,
    "allow_tipping": false,
    "enable_coupon": false,
    "enable_loyalty": false
  },
  "payment_note": "Thanksgiving pre-order · Pickup Tue Nov 24, 9am–5pm · Jane Doe"
}
```

**Design decisions**
- **The slot goes in item names as well as the fulfillment.** Receipts, exports and the Dashboard all show the pickup day even if the pickup fulfillment shows up somewhere less visible. It also keeps a working fallback if Square rejects the fulfillment (§12).
- **`prep_time_duration` is left unset.** Otherwise Square hides scheduled orders from the Order Manager "Active" tab until shortly before pickup, which for pre-orders could be days.
- **Tipping, coupons and loyalty are explicitly off.** US checkout pages otherwise default to a 15% tip and a coupon box.
- **No pickup address field exists in Square.** Pickup uses the Square location's address, so the Bwè Kafe address goes in the pickup note.
- **Tax is set on each order.** Ad hoc line items don't pick up catalog taxes, so the function adds an order-level tax explicitly.

### 7.4 Square behavior relied on (from Square's developer docs)
- Unpaid payment-link orders stay `DRAFT` and don't appear in Order Manager. When paid, they become `OPEN`.
- A payment link can be paid once, by one buyer.
- After payment, Square redirects to `redirect_url` and emails the buyer a receipt and the seller a "payment received" notice.
- A pickup fulfillment requires `recipient.display_name` and `pickup_at` when it's created.
- The checkout page always includes a contact section for the buyer's email and phone. After payment, Square adds them to the order fulfillment's `recipient`.
- API base URLs: production `https://connect.squareup.com`, sandbox `https://connect.squareupsandbox.com`.

### 7.5 Decision: Cloudflare Workers instead of Vercel
The original plan used Vercel. Vercel's free Hobby plan is limited to non-commercial use, and a shop's checkout is commercial. Cloudflare Workers' free plan has no such restriction and comfortably covers this traffic. The logic in `lib/order.js` didn't change; only the request/response wrapper (`src/index.js`) did.

## 8. Configuration

### 8.1 Cloudflare Worker variables (`preorder-api`)

Set in the Cloudflare dashboard: Worker → Settings → Variables and Secrets. `SQUARE_ACCESS_TOKEN` is a **Secret**; the rest are Text. `wrangler.toml` sets `keep_vars = true` so deploys from GitHub don't erase them.

| Variable | Sandbox phase | Live |
|---|---|---|
| `SQUARE_ENV` | `sandbox` | `production` |
| `SQUARE_ACCESS_TOKEN` | Sandbox access token | Production access token (secret) |
| `SQUARE_LOCATION_ID` | `LGNJTM59K97VM` | `LRE7GZ33WEFC6` |
| `ALLOWED_ORIGINS` | `https://damfloralstudio.com,http://localhost:8000` | `https://damfloralstudio.com` |
| `PREORDER_OPENS` | `2026-11-08T00:00:00-05:00` (early, so testing can start before launch) | `2026-11-09T00:00:00-05:00` |
| `PREORDER_CLOSES` | `2026-11-15T23:59:59-05:00` | same |
| `PICKUP_FULFILLMENT` | unset (on) | unset, or `off` if test T1 fails |

Tokens live **only** in Cloudflare, as a Secret. They never go in a repository, a chat or the website. If a token is ever exposed, replace it in the Square Developer Console and update Cloudflare.

### 8.2 Website constants (`thanksgiving.js`)
`CHECKOUT_URL` (the Worker endpoint), `CLOSES_AT` (same close time, used to show the closed state), the product prices and limits for display only, and the slot labels.

## 9. Analytics (Umami Cloud)

**Setup:** add the script to `thanksgiving.html` and `thanksgiving-thanks.html` only:

```html
<script defer src="https://cloud.umami.is/script.js"
        data-website-id="1289bc39-6ae9-4569-83f2-73a3d4c60259"
        data-domains="damfloralstudio.com"></script>
```
`data-domains` keeps local testing out of the numbers.

**Funnel**

| Step | Measure | Source |
|---|---|---|
| 1. Visited | Page views of `/thanksgiving.html` | Umami (automatic) |
| 2. Started an order | `start_order`, once per page load, on the first quantity or slot change | Umami event |
| 3. Clicked checkout | `checkout_click` `{bouquets, arrangements, pickup, subtotal}` | Umami event |
| 4. Reached Square | `checkout_redirect`, sent right before redirecting | Umami event |
| 5. Paid | Paid orders | **Square Dashboard** (source of truth). Views of `/thanksgiving-thanks.html` are a rough cross-check |
| (errors) | `checkout_error` `{reason}` | Umami event |

**Traffic sources:** share links with UTM tags, e.g. `https://damfloralstudio.com/thanksgiving.html?utm_source=instagram&utm_content=story1`.

**Caveats**
- Ad blockers make steps 1–4 undercount, so read them as trends.
- No names or emails are ever sent to Umami.

## 10. Operations

### 10.1 One-time Square Dashboard setup
- [ ] Location `LRE7GZ33WEFC6`: its address is a private home address. Hide or remove it from customer-facing pages and receipts if Square allows (see §12).
- [ ] Checkout / payment link settings: logo, button color `#252421` (the website's ink color, used for its checkout button), and the policy wording from §5.5. Turn off customer notes unless wanted.
- [ ] "Payment received" email notifications on.
- [ ] Confirm the NJ sales tax rate (§14).

### 10.2 During the window
- Orders appear in **Dashboard → Orders** as they're paid.
- Use Umami to watch the funnel. A gap between `checkout_click` and `checkout_redirect` means errors; check the Worker logs.

### 10.3 Cancellations (before Sun Nov 15, 11:59pm)
Refund the payment from the Square Dashboard after receiving the email request.

### 10.4 Pickup days
Before each day, filter or export orders. The item names start with the pickup day, so the export sorts into a Tuesday list and a Wednesday list with names and quantities. Mark orders complete as customers pick up.

## 11. Security and privacy
- The Square token exists only as a Cloudflare Worker secret.
- Prices, tax, limits and the order window are enforced by the function. Editing the page in a browser can't change what's charged.
- CORS limits browser calls to damfloralstudio.com. This isn't an access control: the endpoint only creates unpaid, single-use links, so misuse costs nothing.
- Card data never touches our code. Only the customer's name passes through the function to Square, and it isn't stored by us. Email and phone are entered directly on Square's page.
- The analytics are cookie-free and receive no personal data.

## 12. Risks and known limits

| Risk / limit | Impact | Mitigation |
|---|---|---|
| Square rejects a `PICKUP` fulfillment on payment links (the docs don't show an example) | Orders lack Square's pickup fields | Sandbox test T1 goes first. Fallback: set `PICKUP_FULFILLMENT=off` in Cloudflare to drop `fulfillments` without a code change. Slot and name stay in item names and the payment note |
| Square shows the location's address, a private home address ("700 1st St"), to customers. Pickup orders have no address field, so Square may show the location address as the pickup place, and receipts may show it as the business address | Customers see a private address and may go to the wrong pickup place | Before launch, hide or remove the address in the location's Square settings if possible (e.g. a no-storefront location type or receipt settings). Don't set the location address to Bwè Kafe. During the real-money check, look for the address on the checkout page, the receipt email and any pickup message. If it appears, set `PICKUP_FULFILLMENT=off` so Square has no pickup to attach it to; the slot and name stay in item names and the payment note |
| Limits are per order, not per person | Someone can check out twice | Accepted. Visible in the Dashboard |
| No capacity cap | Could oversell | Accepted for this window. Watch the order count in the Dashboard |
| A visitor's device clock is wrong | Page shows open or closed at the wrong time | The function is the authority. A late click shows the closed message |
| Ad blockers | Analytics undercount | Square is the source of truth |
| Function or Square outage | Customers can't check out | The error message points to email |

**Kill switch:** to stop orders immediately, set `PREORDER_CLOSES` in Cloudflare to a past time and deploy. Every checkout attempt then shows the closed message.

## 13. Test and launch plan

### 13.1 Sandbox tests (function set to `SQUARE_ENV=sandbox`)
Sandbox payment links open Square's **Checkout API Sandbox Testing Panel**, which simulates the payment. The card form under "Preview Checkout" is a non-interactive preview, so you can't pay with a card in sandbox. Checks of the real customer-facing page (tax line, hidden tip/coupon/shipping, branding) move to the real-money check in §13.2 step 5.

| # | Test | Expected |
|---|---|---|
| T1 | Order with pickup fulfillment | **Passed 2026-11-09.** Link created with the `PICKUP` fulfillment, simulated payment succeeded (order `OPEN`), and the sandbox Dashboard order shows items, tax, pickup time and recipient. The fallback (§12) isn't needed |
| T2 | Tax | **Passed in sandbox Dashboard** (NJ Sales Tax on the order). Confirm the tax line on the real checkout page in step 5 |
| T3 | Limits | 4 bouquets, 3 arrangements, 0 items, a bad slot or an empty name are each rejected with the right error |
| T4 | Redirect | **Configured correctly** (testing panel reports redirect to `thanksgiving-thanks.html`). Confirm the real redirect in step 5 |
| T5 | Tipping, coupon, shipping | Can't be seen in sandbox. Confirm none are shown in step 5 |
| T6 | Closed window | With `PREORDER_CLOSES` set to the past, the page shows the closed message |
| T7 | Analytics | **Passed 2026-11-09.** Test order on the live page reached the sandbox testing panel, and the visit and events appeared in Umami |
| T8 | Mobile | Page and checkout work on a phone, including the Instagram in-app browser |

### 13.2 Launch sequence
1. **Function:** push `preorder-api` to `main`, import it into Cloudflare Workers, and set the sandbox-phase variables.
2. **Website:** merge `thanksgiving.html`, `thanksgiving-thanks.html` and their script to `main`, *without* the homepage button. The page is live but unlisted, and **its link isn't shared yet**.
3. Run sandbox tests T1–T8 on the live page.
4. **Switch to production:** update the Cloudflare variables to the Live column (including `PREORDER_OPENS`) and deploy.
5. **Real-money check:** buy one bouquet with a real card on the live page. Look for the private location address on the checkout page, the receipt email and any pickup message (§12). On Square's checkout page, confirm the NJ sales tax line, no tip, coupon or shipping fields, and the studio's branding. After paying, confirm the redirect to the thank-you page. In the Dashboard, check the order, pickup and that the sale appears under Transactions, then refund it. The sandbox Dashboard's Home → Performance tile showed $0.00 net sales after the simulated payment, so sales reporting is only verified here.
6. **Go public:** merge the homepage button and post the UTM-tagged link.
7. **After close:** the page shows the closed message and the homepage button hides itself automatically. Later, remove the button and pages from the repository at leisure.

### 13.3 Rollback
- Use the kill switch (§12) to stop new orders, or
- revert the website commit on `main` to remove the pages. GitHub Pages updates within a couple of minutes.

## 14. Open items
- [ ] **Confirm the NJ sales tax rate.** The design uses the standard 6.625%. Confirm it applies to these sales at this location, e.g. with Square tax settings or an accountant.
- [ ] Worker `workers.dev` address for `CHECKOUT_URL`, known after importing the repository into Cloudflare.
- [ ] Sandbox access token entered in Cloudflare by the owner.

## 15. Repositories and files

**`damfloralstudio/preorder-api`** (new; first commit on `main`, deployed by Cloudflare Workers on every push to `main`)
```
src/index.js        the checkout endpoint (Cloudflare Worker)
wrangler.toml       Worker configuration
lib/order.js        products, prices, slots, tax, Square request body
test/               tests (npm test)
package.json        ES module setting and test script, no dependencies
README.md           setup, environment variables, testing
DESIGN.md           this document
```

**`damfloralstudio/home`** (changes on a working branch, merged to `main` per §13.2)
```
thanksgiving.html          pre-order page
thanksgiving-thanks.html   confirmation page
thanksgiving.js            form logic, checkout call, closed state, analytics events
style.css                  pre-order page styles (added to the existing file)
index.html, script.js      homepage button that hides itself after close (step 6)
README.md                  documents the new pages
```
