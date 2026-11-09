// Cloudflare Worker: POST /api/checkout
// Turns a customer's selection into a Square-hosted checkout link.
// See DESIGN.md §6–§7 for the contract and behavior.

import {
  SQUARE_VERSION,
  ValidationError,
  buildPaymentLinkRequest,
  isWithinWindow,
  squareBaseUrl,
  validateRequest,
} from '../lib/order.js';

const MAX_BODY_BYTES = 10_000;

function readConfig(env) {
  const required = ['SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID', 'SQUARE_ENV', 'ALLOWED_ORIGINS', 'PREORDER_OPENS', 'PREORDER_CLOSES'];
  const missing = required.filter(key => !env[key]);
  if (missing.length) throw new Error(`Missing variables: ${missing.join(', ')}`);
  if (!['sandbox', 'production'].includes(env.SQUARE_ENV)) throw new Error('SQUARE_ENV must be "sandbox" or "production"');
  const opens = new Date(env.PREORDER_OPENS);
  const closes = new Date(env.PREORDER_CLOSES);
  if (Number.isNaN(opens.getTime()) || Number.isNaN(closes.getTime())) throw new Error('PREORDER_OPENS/PREORDER_CLOSES must be ISO 8601 timestamps');
  return {
    token: env.SQUARE_ACCESS_TOKEN,
    locationId: env.SQUARE_LOCATION_ID,
    squareEnv: env.SQUARE_ENV,
    allowedOrigins: env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean),
    opens,
    closes,
    includeFulfillment: (env.PICKUP_FULFILLMENT || '').toLowerCase() !== 'off',
  };
}

function corsHeaders(request, allowedOrigins) {
  const headers = { Vary: 'Origin' };
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

async function readJsonBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new SyntaxError('Body too large');
  return raw ? JSON.parse(raw) : undefined;
}

export async function handleRequest(request, env, { fetchImpl = fetch, now = () => new Date() } = {}) {
  const { pathname } = new URL(request.url);
  if (pathname !== '/api/checkout') return json(404, { error: 'not_found' });

  let config;
  try {
    config = readConfig(env);
  } catch (err) {
    console.error('Configuration error:', err.message);
    return json(500, { error: 'server_misconfigured' });
  }

  const cors = corsHeaders(request, config.allowedOrigins);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { ...cors, Allow: 'POST, OPTIONS' });

  if (!isWithinWindow(now(), config.opens, config.closes)) {
    return json(403, { error: 'preorders_closed' }, cors);
  }

  let selection;
  try {
    selection = validateRequest(await readJsonBody(request));
  } catch (err) {
    if (err instanceof ValidationError) return json(400, { error: err.code }, cors);
    return json(400, { error: 'invalid_request' }, cors);
  }

  const body = buildPaymentLinkRequest(selection, {
    locationId: config.locationId,
    idempotencyKey: crypto.randomUUID(),
    includeFulfillment: config.includeFulfillment,
  });

  try {
    const response = await fetchImpl(`${squareBaseUrl(config.squareEnv)}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Square-Version': SQUARE_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => ({}));
    const url = data?.payment_link?.url;
    if (!response.ok || !url) {
      console.error('Square CreatePaymentLink failed:', response.status, JSON.stringify(data.errors ?? data));
      return json(502, { error: 'square_error' }, cors);
    }
    console.log('Created payment link', JSON.stringify({ order_id: data.payment_link.order_id, pickup: selection.pickup, quantities: selection.quantities }));
    return json(200, { url }, cors);
  } catch (err) {
    console.error('Square request error:', err.name, err.message);
    return json(502, { error: 'square_error' }, cors);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
