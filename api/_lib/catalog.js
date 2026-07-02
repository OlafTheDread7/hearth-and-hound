// Server-side authoritative catalog, sourced from the single products.json file
// (the same file the storefront reads). The browser only ever sends { id, qty };
// all prices and supplier mappings are resolved here so a customer can NEVER
// tamper with the amount charged.
//
// products.json is generated/updated by scripts/import-cj.js from your CJ account.
// `require` (not fs.read) ensures Vercel bundles products.json with the function.

const PRODUCTS = require('../../products.json');

// Build a lookup keyed by product id.  price is in CENTS.
const CATALOG = {};
for (const p of PRODUCTS) {
  CATALOG[p.id] = {
    name: p.name,
    price: p.priceCents,
    cjVid: p.cjVid || '',
    cjSku: p.cjSku || '',
  };
}

// Free shipping at/above this subtotal (in cents); otherwise a flat fee is added.
const FREE_SHIPPING_THRESHOLD = 5000; // $50.00
const FLAT_SHIPPING_FEE = 595;        // $5.95

const CURRENCY = 'usd';

module.exports = { CATALOG, FREE_SHIPPING_THRESHOLD, FLAT_SHIPPING_FEE, CURRENCY };
