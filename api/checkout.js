// POST /api/checkout
// Turns a customer's selection into a Square-hosted checkout link.
// See DESIGN.md §6–§7 for the contract and behavior.

import { randomUUID } from 'node:crypto';
import {
  SQUARE_VERSION,
  ValidationError,
  buildPaymentLinkRequest,
  isWithinWindow,
  squareBaseUrl,
  validateRequest,
} from '../lib/order.js';

function readConfig(env) {
  const required = ['SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID', 'SQUARE_ENV', 'ALLOWED_ORIGINS', 'PREORDER_OPENS', 'PREORDER_CLOSES'];
  const missing = required.filter(key => !env[key]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
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

function setCors(req, res, allowedOrigins) {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  // Vercel parses JSON bodies into req.body; fall back to reading the stream.
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return req.body;
  }
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new SyntaxError('Body too large');
  }
  return raw ? JSON.parse(raw) : undefined;
}

export default async function handler(req, res, { env = process.env, fetchImpl = fetch, now = () => new Date() } = {}) {
  let config;
  try {
    config = readConfig(env);
  } catch (err) {
    console.error('Configuration error:', err.message);
    return send(res, 500, { error: 'server_misconfigured' });
  }

  setCors(req, res, config.allowedOrigins);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(res, 405, { error: 'method_not_allowed' });
  }

  if (!isWithinWindow(now(), config.opens, config.closes)) {
    return send(res, 403, { error: 'preorders_closed' });
  }

  let selection;
  try {
    selection = validateRequest(await readJsonBody(req));
  } catch (err) {
    if (err instanceof ValidationError) return send(res, 400, { error: err.code });
    return send(res, 400, { error: 'invalid_request' });
  }

  const body = buildPaymentLinkRequest(selection, {
    locationId: config.locationId,
    idempotencyKey: randomUUID(),
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
      return send(res, 502, { error: 'square_error' });
    }
    console.log('Created payment link', JSON.stringify({ order_id: data.payment_link.order_id, pickup: selection.pickup, quantities: selection.quantities }));
    return send(res, 200, { url });
  } catch (err) {
    console.error('Square request error:', err.name, err.message);
    return send(res, 502, { error: 'square_error' });
  }
}
