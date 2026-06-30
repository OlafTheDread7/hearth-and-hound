// POST /api/webhook  — Stripe webhook receiver.
// On `checkout.session.completed`, it verifies the Stripe signature and then
// places the order with CJdropshipping automatically.
//
// IMPORTANT: Stripe signature verification needs the RAW request body, so we
// disable Vercel's automatic body parsing below and read the stream ourselves.

const Stripe = require('stripe');
const { CATALOG } = require('./_lib/catalog');
const cj = require('./_lib/cj');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Read the raw request body as a Buffer (required for signature verification).
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method not allowed');
  }

  let event;
  try {
    const raw = await readRawBody(req);
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  try {
    // Re-fetch the session to be sure we have customer + shipping details.
    const session = await stripe.checkout.sessions.retrieve(event.data.object.id);

    // Shipping details moved across API versions — check both locations.
    const shipping =
      session.shipping_details ||
      (session.collected_information && session.collected_information.shipping_details) ||
      {};
    const addr = shipping.address || {};
    const details = session.customer_details || {};
    const name = shipping.name || details.name || 'Customer';

    const cart = JSON.parse((session.metadata && session.metadata.cart) || '[]');

    // Map our cart to CJ variants. Refuse to place an order if anything is unmapped.
    const products = [];
    const unmapped = [];
    for (const { id, qty } of cart) {
      const p = CATALOG[id];
      if (!p) { unmapped.push(id); continue; }
      if (!p.cjVid && !p.cjSku) { unmapped.push(id); continue; }
      const line = { quantity: qty, storeLineItemId: `${session.id}-${id}` };
      if (p.cjVid) line.vid = p.cjVid; else line.sku = p.cjSku;
      products.push(line);
    }

    if (unmapped.length) {
      // Payment already succeeded — do NOT 500 (Stripe would retry forever).
      // Log loudly so you can fulfill manually / finish the CJ mapping.
      console.error(
        `ORDER ${session.id} PAID but NOT auto-fulfilled — unmapped CJ products: ${unmapped.join(', ')}. ` +
        `Fill cjVid in api/_lib/catalog.js. Customer: ${details.email}`
      );
      return res.status(200).json({ received: true, fulfilled: false, unmapped });
    }

    const order = {
      orderNumber: session.id, // unique → natural idempotency on CJ's side
      shippingCustomerName: name,
      shippingPhone: details.phone || '',
      email: details.email || '',
      shippingCountryCode: addr.country || '',
      shippingCountry: addr.country || '',
      shippingProvince: addr.state || '',
      shippingCity: addr.city || '',
      shippingAddress: addr.line1 || '',
      shippingAddress2: addr.line2 || '',
      shippingZip: addr.postal_code || '',
      logisticName: process.env.CJ_LOGISTIC_NAME || 'CJPacket Ordinary',
      fromCountryCode: process.env.CJ_FROM_COUNTRY || 'CN',
      payType: parseInt(process.env.CJ_PAY_TYPE || '2', 10), // 2 = pay from CJ balance
      isSandbox: process.env.CJ_SANDBOX === '1' ? 1 : 0,
      remark: 'Hearth & Hound order',
      products,
    };

    const result = await cj.createOrder(order);
    console.log(`ORDER ${session.id} fulfilled via CJ. CJ orderId: ${result.orderId}`);
    return res.status(200).json({ received: true, fulfilled: true, cjOrderId: result.orderId });
  } catch (err) {
    // Log for investigation. Returning 200 prevents infinite Stripe retries on a
    // permanent error; switch to 500 if you WANT Stripe to retry transient failures.
    console.error('Fulfillment error:', err.message);
    return res.status(200).json({ received: true, fulfilled: false, error: err.message });
  }
}

module.exports = handler;
// Tell Vercel not to pre-parse the body so we can verify the Stripe signature.
module.exports.config = { api: { bodyParser: false } };
