#!/usr/bin/env node
/**
 * CJ product importer.
 *
 * Reads scripts/import.config.json (which CJ products you want to sell, plus your
 * marketing copy + markup), calls CJdropshipping's /product/query for each, and
 * writes ../products.json with real names, images, prices, and variant IDs (VIDs).
 *
 * Run from the project root, with your CJ credentials in the environment:
 *   CJ_EMAIL=you@example.com CJ_API_KEY=xxxx node scripts/import-cj.js
 *
 * Nothing is charged and no orders are placed — this only READS the CJ catalog.
 */

const fs = require('fs');
const path = require('path');

const CJ_BASE = 'https://developers.cjdropshipping.com/api2.0/v1';
const CONFIG_PATH = path.join(__dirname, 'import.config.json');
const OUT_PATH = path.join(__dirname, '..', 'products.json');
const QPS_CODE = 1600200; // CJ "Too Many Requests" (1 request/second limit)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function dollarsToCents(n) { return Math.round(Number(n) * 100); }

// Round a price up to a friendly ".99" ending.
function niceCents(cents) {
  const dollars = cents / 100;
  return (Math.ceil(dollars) * 100) - 1; // -> $X.99
}

async function getAccessToken() {
  const email = process.env.CJ_EMAIL, apiKey = process.env.CJ_API_KEY;
  if (!email || !apiKey) throw new Error('Set CJ_EMAIL and CJ_API_KEY in the environment.');
  const res = await fetch(`${CJ_BASE}/authentication/getAccessToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: apiKey }),
  });
  const j = await res.json();
  if (!j.result || !j.data || !j.data.accessToken) {
    throw new Error(`CJ auth failed: ${j.message || JSON.stringify(j)}`);
  }
  return j.data.accessToken;
}

async function queryProduct(token, pid) {
  // Retry on CJ's 1-request/second rate limit.
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${CJ_BASE}/product/query?pid=${encodeURIComponent(pid)}`, {
      headers: { 'CJ-Access-Token': token },
    });
    const j = await res.json();
    if (j.code === QPS_CODE) { await sleep(1600); continue; }
    if (!j.result || !j.data) throw new Error(`product/query failed for ${pid}: ${j.message || JSON.stringify(j)}`);
    return j.data;
  }
  throw new Error(`product/query rate-limited for ${pid} (try again in a moment)`);
}

// Pick the variant to sell: the one whose vid matches config.vid, else the first.
function pickVariant(product, wantedVid) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (wantedVid) {
    const match = variants.find((v) => v.vid === wantedVid);
    if (match) return match;
    console.warn(`  ! vid ${wantedVid} not found; using first variant.`);
  }
  return variants[0] || null;
}

async function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing ${CONFIG_PATH}. Copy scripts/import.config.example.json to scripts/import.config.json and fill it in.`);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const items = config.products || [];
  const defaultMarkup = config.defaultMarkup || 3; // retail = cost x markup

  const token = await getAccessToken();
  console.log(`Authenticated with CJ. Importing ${items.length} product(s)...`);

  const out = [];
  for (const item of items) {
    if (!item.pid || item.pid.includes('PASTE')) {
      console.warn(`Skipping "${item.id}" — no CJ pid filled in yet.`);
      continue;
    }
    console.log(`- ${item.id}  (pid ${item.pid})`);
    const product = await queryProduct(token, item.pid);
    const variant = pickVariant(product, item.vid);
    if (!variant) { console.warn('  ! no variants returned; skipping.'); continue; }

    const cost = Number(variant.variantSellPrice != null ? variant.variantSellPrice : (product.sellPrice || 0));
    const markup = item.markup || defaultMarkup;
    const priceCents = item.priceUsd != null
      ? dollarsToCents(item.priceUsd)               // explicit retail price wins
      : niceCents(dollarsToCents(cost * markup));   // else cost x markup, prettified

    const image = variant.variantImage || (product.productImageSet && product.productImageSet[0]) || product.bigImage || '';

    out.push({
      id: item.id,
      name: item.name || product.productNameEn || item.id,
      category: item.category || product.categoryName || '',
      priceCents,
      compareAtCents: item.compareAtUsd != null ? dollarsToCents(item.compareAtUsd) : 0,
      tag: item.tag || '',
      rating: item.rating || 4.7,
      reviews: item.reviews || 0,
      desc: item.desc || (product.productNameEn || ''),
      features: item.features || [],
      image,
      cjVid: variant.vid || '',
      cjSku: variant.variantSku || '',
      cjPid: product.pid || item.pid,
    });

    console.log(`  CJ cost $${cost.toFixed(2)}  ->  retail $${(priceCents / 100).toFixed(2)}  vid ${variant.vid}`);
    await sleep(1200); // stay under CJ's 1 request/second limit
  }

  if (out.length === 0) {
    console.warn('No products imported (all pids still blank/placeholder). ' +
      'Leaving the existing products.json untouched.');
    return;
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${out.length} product(s) to products.json.`);
  console.log('Review prices/margins, then commit + redeploy.');
}

main().catch((err) => { console.error('Import failed:', err.message); process.exit(1); });
