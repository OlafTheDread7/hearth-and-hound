// POST /api/checkout
// Body: { items: [{ id, qty }, ...] }
// Creates a Stripe Checkout Session using SERVER-side prices, collects the
// shipping address + phone, and returns { url } for the browser to redirect to.

const Stripe = require('stripe');
const { CATALOG, FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING_FEE, CURRENCY } = require('./_lib/catalog');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Vercel may hand us req.body already-parsed; fall back to manual parse.
    const body = typeof req.body === 'object' && req.body ? req.body : JSON.parse(req.body || '{}');
    const items = Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }

    // Build line items from the AUTHORITATIVE server catalog.
    const line_items = [];
    const cleanCart = [];
    let subtotal = 0;

    for (const item of items) {
      const product = CATALOG[item.id];
      const qty = Math.max(1, Math.min(99, parseInt(item.qty, 10) || 0));
      if (!product) continue; // ignore unknown ids silently
      subtotal += product.price * qty;
      cleanCart.push({ id: item.id, qty });
      line_items.push({
        quantity: qty,
        price_data: {
          currency: CURRENCY,
          unit_amount: product.price,
          product_data: { name: product.name },
        },
      });
    }

    if (line_items.length === 0) {
      return res.status(400).json({ error: 'No valid items in cart.' });
    }

    // Shipping: free over the threshold, otherwise a flat fee.
    const shipping_options = [{
      shipping_rate_data: {
        type: 'fixed_amount',
        display_name: subtotal >= FREE_SHIPPING_THRESHOLD ? 'Free shipping' : 'Standard shipping',
        fixed_amount: {
          amount: subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE,
          currency: CURRENCY,
        },
        delivery_estimate: {
          minimum: { unit: 'business_day', value: 5 },
          maximum: { unit: 'business_day', value: 12 },
        },
      },
    }];

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      shipping_options,
      phone_number_collection: { enabled: true },
      shipping_address_collection: {
        // Add/trim countries you actually ship to.
        allowed_countries: ['US', 'CA', 'GB', 'AU'],
      },
      // The webhook reads this to build the supplier order.
      metadata: { cart: JSON.stringify(cleanCart) },
      success_url: `${origin}/?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?canceled=true`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('checkout error:', err);
    return res.status(500).json({ error: 'Could not start checkout.' });
  }
};
