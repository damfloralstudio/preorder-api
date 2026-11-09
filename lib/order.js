// Catalog, validation and Square request building for Thanksgiving pre-orders.
// Prices, limits and pickup times live here, on the server, never in the browser.

export const PRODUCTS = {
  bouquet: { name: 'Thanksgiving Bouquet · Designer’s Choice', priceCents: 5000, max: 3 },
  arrangement: { name: 'Pumpkin Floral Arrangement · Designer’s Choice', priceCents: 6000, max: 2 },
};

// Pickup windows in Eastern time (EST, UTC-5): Tue 10am–4pm, Wed 9am–12pm.
export const PICKUP_SLOTS = {
  tue: { pickupAt: '2026-11-24T15:00:00Z', window: 'PT6H', short: 'Pickup Tue 11/24', long: 'Pickup Tue Nov 24, 10am–4pm' },
  wed: { pickupAt: '2026-11-25T14:00:00Z', window: 'PT3H', short: 'Pickup Wed 11/25', long: 'Pickup Wed Nov 25, 9am–12pm' },
};

export const PICKUP_NOTE = 'Pickup at Bwè Kafe, 1002 Washington St, Hoboken, NJ 07030';
export const TAX = { uid: 'nj-sales-tax', name: 'NJ Sales Tax', percentage: '6.625', type: 'ADDITIVE', scope: 'ORDER' };
export const SQUARE_VERSION = '2026-09-16';
export const REDIRECT_URL = 'https://damfloralstudio.com/thanksgiving-thanks.html';
export const SUPPORT_EMAIL = 'damfloralstudio@gmail.com';
export const NAME_MAX = 100;

export class ValidationError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Returns { quantities, pickup, name } or throws ValidationError with an API error code.
export function validateRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('invalid_request');

  const items = body.items;
  if (!items || typeof items !== 'object' || Array.isArray(items)) throw new ValidationError('empty_order');
  for (const key of Object.keys(items)) {
    if (!PRODUCTS[key]) throw new ValidationError('invalid_quantity');
  }
  const quantities = {};
  let total = 0;
  for (const [key, product] of Object.entries(PRODUCTS)) {
    const qty = items[key] ?? 0;
    if (!Number.isInteger(qty) || qty < 0 || qty > product.max) throw new ValidationError('invalid_quantity');
    quantities[key] = qty;
    total += qty;
  }
  if (total === 0) throw new ValidationError('empty_order');

  if (typeof body.pickup !== 'string' || !Object.hasOwn(PICKUP_SLOTS, body.pickup)) throw new ValidationError('invalid_pickup');

  if (typeof body.name !== 'string') throw new ValidationError('invalid_name');
  // Drop control characters and collapse runs of whitespace.
  const name = body.name.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > NAME_MAX) throw new ValidationError('invalid_name');

  return { quantities, pickup: body.pickup, name };
}

export function isWithinWindow(now, opens, closes) {
  const t = now.getTime();
  return t >= opens.getTime() && t <= closes.getTime();
}

// Builds the body for POST /v2/online-checkout/payment-links.
export function buildPaymentLinkRequest({ quantities, pickup, name }, { locationId, idempotencyKey, includeFulfillment = true }) {
  const slot = PICKUP_SLOTS[pickup];
  const lineItems = Object.entries(PRODUCTS)
    .filter(([key]) => quantities[key] > 0)
    .map(([key, product]) => ({
      name: `${product.name} — ${slot.short}`,
      quantity: String(quantities[key]),
      base_price_money: { amount: product.priceCents, currency: 'USD' },
    }));

  const order = {
    location_id: locationId,
    line_items: lineItems,
    taxes: [{ ...TAX }],
  };
  if (includeFulfillment) {
    order.fulfillments = [{
      type: 'PICKUP',
      state: 'PROPOSED',
      pickup_details: {
        recipient: { display_name: name },
        schedule_type: 'SCHEDULED',
        pickup_at: slot.pickupAt,
        pickup_window_duration: slot.window,
        note: PICKUP_NOTE,
      },
    }];
  }

  return {
    idempotency_key: idempotencyKey,
    order,
    checkout_options: {
      redirect_url: REDIRECT_URL,
      merchant_support_email: SUPPORT_EMAIL,
      ask_for_shipping_address: false,
      allow_tipping: false,
      enable_coupon: false,
      enable_loyalty: false,
    },
    payment_note: `Thanksgiving pre-order · ${slot.long} · ${name}`,
  };
}

export function squareBaseUrl(env) {
  return env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}
