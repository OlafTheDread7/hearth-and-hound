// Minimal CJdropshipping API client (v2.0).
// Docs: https://developers.cjdropshipping.com/
//
// Auth flow: POST /authentication/getAccessToken with { email, password: apiKey }
//   -> returns an accessToken valid ~15 days. CJ rate-limits token requests
//      (roughly once / 5 min), so we cache the token in module scope. On a warm
//      serverless instance this is reused; for high volume, persist it in a KV/DB.

const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';

let _token = null;        // cached access token
let _tokenExpiry = 0;     // epoch ms when we should refresh

async function getAccessToken() {
  const now = Date.now();
  if (_token && now < _tokenExpiry) return _token;

  const email = process.env.CJ_EMAIL;
  const apiKey = process.env.CJ_API_KEY;
  if (!email || !apiKey) {
    throw new Error('CJ_EMAIL / CJ_API_KEY env vars are not set.');
  }

  const res = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: apiKey }),
  });
  const json = await res.json();
  if (!json.result || !json.data || !json.data.accessToken) {
    throw new Error(`CJ auth failed: ${json.message || JSON.stringify(json)}`);
  }

  _token = json.data.accessToken;
  // Refresh a day before the ~15-day expiry to be safe.
  _tokenExpiry = Date.now() + 14 * 24 * 60 * 60 * 1000;
  return _token;
}

// Create a dropship order. `order` matches CJ's createOrderV2 body.
// Returns CJ's `data` object (includes orderId, cjPayUrl, amounts, ...).
async function createOrder(order) {
  const token = await getAccessToken();
  const res = await fetch(`${CJ_BASE}/shopping/order/createOrderV2`, {
    method: 'POST',
    headers: {
      'CJ-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(order),
  });
  const json = await res.json();
  if (!json.result) {
    throw new Error(`CJ createOrder failed (code ${json.code}): ${json.message}`);
  }
  return json.data;
}

module.exports = { getAccessToken, createOrder, CJ_BASE };
