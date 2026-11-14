import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { handleRequest } from '../src/index.js';
import { buildPaymentLinkRequest, validateRequest } from '../lib/order.js';

const ENV = {
  SQUARE_ACCESS_TOKEN: 'test-token',
  SQUARE_LOCATION_ID: 'LTEST',
  SQUARE_ENV: 'sandbox',
  ALLOWED_ORIGINS: 'https://damfloralstudio.com,http://localhost:8000',
  PREORDER_OPENS: '2026-11-09T00:00:00-05:00',
  PREORDER_CLOSES: '2026-11-18T23:59:59-05:00',
};
const DURING = () => new Date('2026-11-10T12:00:00Z');
const ENDPOINT = 'https://preorder-api.example.workers.dev/api/checkout';

function makeRequest({ method = 'POST', origin = 'https://damfloralstudio.com', body, url = ENDPOINT } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  const init = { method, headers };
  if (body !== undefined && method !== 'GET' && method !== 'OPTIONS') init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(url, init);
}

function squareOk(captured) {
  return async (url, init) => {
    captured.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ payment_link: { url: 'https://sandbox.square.link/u/abc', order_id: 'o1' } }), { status: 200 });
  };
}

async function call(reqOpts, { env = ENV, ...opts } = {}) {
  const response = await handleRequest(makeRequest(reqOpts), env, { now: DURING, fetchImpl: squareOk([]), ...opts });
  const text = await response.text();
  return {
    statusCode: response.status,
    headers: Object.fromEntries([...response.headers].map(([k, v]) => [k.toLowerCase(), v])),
    json: () => JSON.parse(text),
  };
}

const VALID = { items: { bouquet: 2, arrangement: 1 }, pickup: 'tue', name: 'Jane Doe' };

test('valid order returns the Square checkout URL', async () => {
  const captured = [];
  const res = await call({ body: VALID }, { fetchImpl: squareOk(captured) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { url: 'https://sandbox.square.link/u/abc' });
  assert.equal(res.headers['access-control-allow-origin'], 'https://damfloralstudio.com');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, 'https://connect.squareupsandbox.com/v2/online-checkout/payment-links');
  assert.equal(captured[0].init.headers.Authorization, 'Bearer test-token');
  assert.equal(captured[0].init.headers['Square-Version'], '2026-09-16');
});

test('Square request has server-side prices, tax, pickup and checkout options', async () => {
  const captured = [];
  await call({ body: { ...VALID, pickup: 'wed' } }, { fetchImpl: squareOk(captured) });
  const { body } = captured[0];
  assert.ok(body.idempotency_key);
  assert.equal(body.order.location_id, 'LTEST');
  assert.deepEqual(body.order.line_items, [
    { name: 'Thanksgiving Bouquet · Designer’s Choice — Pickup Wed 11/25', quantity: '2', base_price_money: { amount: 5000, currency: 'USD' } },
    { name: 'Pumpkin Floral Arrangement · Designer’s Choice — Pickup Wed 11/25', quantity: '1', base_price_money: { amount: 6000, currency: 'USD' } },
  ]);
  assert.deepEqual(body.order.taxes, [{ uid: 'nj-sales-tax', name: 'NJ Sales Tax', percentage: '6.625', type: 'ADDITIVE', scope: 'ORDER' }]);
  const pickup = body.order.fulfillments[0];
  assert.equal(pickup.type, 'PICKUP');
  assert.deepEqual(pickup.pickup_details.recipient, { display_name: 'Jane Doe' });
  assert.equal(pickup.pickup_details.pickup_at, '2026-11-25T14:00:00Z');
  assert.equal(pickup.pickup_details.pickup_window_duration, 'PT3H');
  assert.equal(pickup.pickup_details.prep_time_duration, undefined);
  assert.deepEqual(body.checkout_options, {
    redirect_url: 'https://damfloralstudio.com/thanksgiving-thanks.html',
    merchant_support_email: 'damfloralstudio@gmail.com',
    ask_for_shipping_address: false,
    allow_tipping: false,
    enable_coupon: false,
    enable_loyalty: false,
  });
  assert.equal(body.pre_populated_data, undefined);
  assert.equal(body.payment_note, 'Thanksgiving pre-order · Pickup Wed Nov 25, 9am–12pm · Jane Doe');
});

test('client-sent prices or extra fields are ignored', async () => {
  const captured = [];
  await call({ body: { ...VALID, price: 1, items: { bouquet: 1 } } }, { fetchImpl: squareOk(captured) });
  assert.equal(captured[0].body.order.line_items[0].base_price_money.amount, 5000);
  assert.equal(captured[0].body.order.line_items.length, 1);
});

test('PICKUP_FULFILLMENT=off drops the fulfillment but keeps the slot in item names', async () => {
  const captured = [];
  await call({ body: VALID }, { env: { ...ENV, PICKUP_FULFILLMENT: 'off' }, fetchImpl: squareOk(captured) });
  assert.equal(captured[0].body.order.fulfillments, undefined);
  assert.match(captured[0].body.order.line_items[0].name, /Pickup Tue 11\/24/);
});

test('Tuesday pickup is 10am–4:30pm Eastern', async () => {
  const captured = [];
  await call({ body: VALID }, { fetchImpl: squareOk(captured) });
  const details = captured[0].body.order.fulfillments[0].pickup_details;
  assert.equal(details.pickup_at, '2026-11-24T15:00:00Z');
  assert.equal(details.pickup_window_duration, 'PT6H30M');
  assert.equal(captured[0].body.payment_note, 'Thanksgiving pre-order · Pickup Tue Nov 24, 10am–4:30pm · Jane Doe');
});

test('production uses the production Square URL', async () => {
  const captured = [];
  await call({ body: VALID }, { env: { ...ENV, SQUARE_ENV: 'production' }, fetchImpl: squareOk(captured) });
  assert.equal(captured[0].url, 'https://connect.squareup.com/v2/online-checkout/payment-links');
});

for (const [label, body, code] of [
  ['4 bouquets', { ...VALID, items: { bouquet: 4 } }, 'invalid_quantity'],
  ['3 arrangements', { ...VALID, items: { arrangement: 3 } }, 'invalid_quantity'],
  ['negative quantity', { ...VALID, items: { bouquet: -1, arrangement: 1 } }, 'invalid_quantity'],
  ['fractional quantity', { ...VALID, items: { bouquet: 1.5 } }, 'invalid_quantity'],
  ['quantity as string', { ...VALID, items: { bouquet: '2' } }, 'invalid_quantity'],
  ['unknown product', { ...VALID, items: { bouquet: 1, wreath: 1 } }, 'invalid_quantity'],
  ['zero items', { ...VALID, items: { bouquet: 0, arrangement: 0 } }, 'empty_order'],
  ['missing items', { pickup: 'tue', name: 'Jane' }, 'empty_order'],
  ['bad slot', { ...VALID, pickup: 'thu' }, 'invalid_pickup'],
  ['prototype slot', { ...VALID, pickup: 'toString' }, 'invalid_pickup'],
  ['empty name', { ...VALID, name: '   ' }, 'invalid_name'],
  ['missing name', { items: { bouquet: 1 }, pickup: 'tue' }, 'invalid_name'],
  ['name too long', { ...VALID, name: 'x'.repeat(101) }, 'invalid_name'],
  ['not an object', [1, 2], 'invalid_request'],
]) {
  test(`rejects ${label}`, async () => {
    const res = await call({ body });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.json(), { error: code });
  });
}

test('rejects malformed JSON', async () => {
  const res = await call({ body: '{not json' });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.json(), { error: 'invalid_request' });
});

test('name is trimmed and whitespace collapsed', () => {
  const { name } = validateRequest({ ...VALID, name: '  Jane \n\t Doe  ' });
  assert.equal(name, 'Jane Doe');
});

test('max quantities are accepted', () => {
  const sel = validateRequest({ ...VALID, items: { bouquet: 3, arrangement: 2 } });
  assert.deepEqual(sel.quantities, { bouquet: 3, arrangement: 2 });
});

test('closed before the window opens and after it closes', async () => {
  for (const at of ['2026-11-09T04:59:59Z', '2026-11-19T05:00:00Z']) {
    const res = await call({ body: VALID }, { now: () => new Date(at) });
    assert.equal(res.statusCode, 403, at);
    assert.deepEqual(res.json(), { error: 'preorders_closed' });
  }
});

test('open at the first and last second of the window', async () => {
  for (const at of ['2026-11-09T05:00:00Z', '2026-11-19T04:59:59Z']) {
    const res = await call({ body: VALID }, { now: () => new Date(at) });
    assert.equal(res.statusCode, 200, at);
  }
});

test('OPTIONS preflight from an allowed origin', async () => {
  const res = await call({ method: 'OPTIONS' });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'https://damfloralstudio.com');
  assert.equal(res.headers['access-control-allow-methods'], 'POST, OPTIONS');
});

test('no CORS headers for other origins', async () => {
  const res = await call({ method: 'OPTIONS', origin: 'https://evil.example' });
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('GET is rejected', async () => {
  const res = await call({ method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.json(), { error: 'method_not_allowed' });
});

test('Square error returns square_error without leaking details', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ errors: [{ code: 'UNAUTHORIZED', detail: 'secret detail' }] }), { status: 401 });
  const origError = console.error; console.error = () => {};
  try {
    const res = await call({ body: VALID }, { fetchImpl });
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.json(), { error: 'square_error' });
  } finally { console.error = origError; }
});

test('network failure returns square_error', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  const origError = console.error; console.error = () => {};
  try {
    const res = await call({ body: VALID }, { fetchImpl });
    assert.equal(res.statusCode, 502);
  } finally { console.error = origError; }
});

test('missing configuration returns server_misconfigured', async () => {
  const origError = console.error; console.error = () => {};
  try {
    const res = await call({ body: VALID }, { env: { ...ENV, SQUARE_ACCESS_TOKEN: '' } });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.json(), { error: 'server_misconfigured' });
  } finally { console.error = origError; }
});

test('unknown paths return 404', async () => {
  const res = await call({ body: VALID, url: 'https://preorder-api.example.workers.dev/' });
  assert.equal(res.statusCode, 404);
});

test('default export exposes a Workers fetch handler', () => {
  assert.equal(typeof worker.fetch, 'function');
});

test('buildPaymentLinkRequest omits products with zero quantity', () => {
  const body = buildPaymentLinkRequest(
    { quantities: { bouquet: 0, arrangement: 2 }, pickup: 'tue', name: 'A' },
    { locationId: 'L', idempotencyKey: 'k' },
  );
  assert.equal(body.order.line_items.length, 1);
  assert.equal(body.order.line_items[0].name, 'Pumpkin Floral Arrangement · Designer’s Choice — Pickup Tue 11/24');
});
