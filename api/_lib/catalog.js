// Server-side authoritative catalog.
// The browser only ever sends { id, qty }. All prices and supplier mappings
// live here so a customer can NEVER tamper with the amount they're charged.
//
// price  = amount charged to the customer, in CENTS (USD).
// cjVid  = CJdropshipping variant ID (VID) for the exact variant you sell.
//          Get this from CJ: find the product → open the variant → copy its VID,
//          OR call CJ's product/listV2 / variant endpoints. Leave "" until mapped;
//          orders for unmapped items will be flagged (not silently dropped).
// cjSku  = optional CJ SKU. CJ accepts vid OR sku; vid is preferred.
//
// NOTE: keep `id`, names, and prices in sync with the catalog in index.html.

const CATALOG = {
  ortho:   { name: 'Cloud Orthopedic Dog Bed',   price: 12900, cjVid: '', cjSku: '' },
  donut:   { name: 'Calming Donut Bed',          price:  8900, cjVid: '', cjSku: '' },
  vest:    { name: 'Anti-Anxiety Wrap Vest',     price:  3900, cjVid: '', cjSku: '' },
  chews:   { name: 'Calming Hemp Chews',         price:  2900, cjVid: '', cjSku: '' },
  lickmat: { name: 'Slow-Feed Lick Mat',         price:  1900, cjVid: '', cjSku: '' },
  blanket: { name: 'Self-Warming Snug Blanket',  price:  3400, cjVid: '', cjSku: '' },
  groom:   { name: 'Pro Grooming Kit',           price:  4900, cjVid: '', cjSku: '' },
  collar:  { name: 'GPS Smart Collar',           price:  7900, cjVid: '', cjSku: '' },
};

// Free shipping at/above this subtotal (in cents); otherwise a flat fee is added.
const FREE_SHIPPING_THRESHOLD = 5000; // $50.00
const FLAT_SHIPPING_FEE = 595;        // $5.95

const CURRENCY = 'usd';

module.exports = { CATALOG, FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING_FEE, CURRENCY };
