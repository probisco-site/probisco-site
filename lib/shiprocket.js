// Shiprocket: push paid orders automatically so they appear under Orders > New, ready to ship.
// Needs SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD (an API user, created in Shiprocket > Settings > API)
// and SHIPROCKET_PICKUP_LOCATION (the exact pickup address nickname in Shiprocket).
import { sb, eq } from './supabase.js';
import { PRODUCT } from './shop.js';

const BASE = 'https://apiv2.shiprocket.in/v1/external';
const TOKEN_KEY = 'shiprocket_token';
const TOKEN_MAX_AGE_MS = 20 * 60 * 60 * 1000; // refresh before Shiprocket's expiry

export const shiprocketEnabled = (env) =>
  Boolean(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD && env.SHIPROCKET_PICKUP_LOCATION);

async function login(env) {
  const res = await fetch(`${env.SHIPROCKET_API_BASE || BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.token) throw new Error('Shiprocket login failed: ' + (j.message || res.status));
  await sb(env, 'POST', 'app_settings?on_conflict=key',
    { key: TOKEN_KEY, value: j.token, updated_at: new Date().toISOString() },
    'resolution=merge-duplicates,return=minimal');
  return j.token;
}

async function getToken(env, force = false) {
  if (!force) {
    const rows = await sb(env, 'GET', `app_settings?key=${eq(TOKEN_KEY)}&select=value,updated_at`);
    const t = rows?.[0];
    if (t?.value && Date.now() - new Date(t.updated_at).getTime() < TOKEN_MAX_AGE_MS) return t.value;
  }
  return login(env);
}

async function call(env, path, body) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(env, attempt > 0);
    const res = await fetch(`${env.SHIPROCKET_API_BASE || BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    if (res.status === 401 && attempt === 0) continue; // token expired: log in again once
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = j.errors ? JSON.stringify(j.errors) : (j.message || res.status);
      throw new Error('Shiprocket: ' + detail);
    }
    return j;
  }
}

function istStamp(d = new Date()) {
  const t = new Date(d.getTime() + 330 * 60000).toISOString(); // IST
  return t.slice(0, 10) + ' ' + t.slice(11, 16);
}

// Package size: editable in Shiprocket before booking a courier if a box differs.
function packageFor(env, qty) {
  const perJar = Number(env.SHIPROCKET_WEIGHT_PER_JAR_KG || 0.3);
  const [l, b, h] = String(env.SHIPROCKET_BOX_CM || '20x15x15').split('x').map(Number);
  return { length: l || 20, breadth: b || 15, height: h || 15, weight: Math.round((0.1 + qty * perJar) * 100) / 100 };
}

export async function createShiprocketOrder(env, o) {
  const [first, ...rest] = String(o.customer_name).trim().split(/\s+/);
  const perJarPrice = o.unit_price - (o.quantity ? Math.round((o.discount || 0) / o.quantity) : 0);
  const body = {
    order_id: o.order_number,
    order_date: istStamp(o.paid_at ? new Date(o.paid_at) : new Date()),
    pickup_location: env.SHIPROCKET_PICKUP_LOCATION,
    channel_id: env.SHIPROCKET_CHANNEL_ID || undefined,
    comment: [o.coupon_code ? 'Coupon ' + o.coupon_code : '', o.notes || ''].filter(Boolean).join(' · ') || undefined,
    billing_customer_name: first || o.customer_name,
    billing_last_name: rest.join(' ') || '.',
    billing_address: o.address_line1,
    billing_address_2: o.address_line2 || '',
    billing_city: o.city,
    billing_pincode: o.pincode,
    billing_state: o.state,
    billing_country: 'India',
    billing_email: o.email,
    billing_phone: o.phone,
    shipping_is_billing: true,
    order_items: [{
      name: PRODUCT.name,
      sku: o.sku || PRODUCT.sku,
      units: o.quantity,
      selling_price: perJarPrice,
      discount: 0,
      hsn: 1905,
    }],
    payment_method: 'Prepaid',
    shipping_charges: o.delivery_fee || 0,
    giftwrap_charges: 0,
    transaction_charges: 0,
    total_discount: 0,
    sub_total: perJarPrice * o.quantity,
    ...packageFor(env, o.quantity),
  };
  const j = await call(env, '/orders/create/adhoc', body);
  return { shiprocketOrderId: j.order_id ? String(j.order_id) : null, shipmentId: j.shipment_id ? String(j.shipment_id) : null };
}

// Push an order and record the result on it. Never throws.
export async function pushOrderToShiprocket(env, o) {
  if (!shiprocketEnabled(env)) return { skipped: true };
  try {
    const r = await createShiprocketOrder(env, o);
    await sb(env, 'PATCH', `orders?id=${eq(o.id)}`,
      { shiprocket_order_id: r.shiprocketOrderId, shiprocket_shipment_id: r.shipmentId, shiprocket_error: null }, 'return=minimal');
    return { ok: true, ...r };
  } catch (e) {
    console.error('shiprocket push', e);
    await sb(env, 'PATCH', `orders?id=${eq(o.id)}`, { shiprocket_error: String(e.message).slice(0, 500) }, 'return=minimal').catch(() => {});
    return { ok: false, error: e.message };
  }
}

// Map Shiprocket tracking labels to our order statuses.
export function mapCourierStatus(label) {
  const s = String(label || '').toUpperCase();
  if (!s) return null;
  if (s.includes('RTO') || s.includes('UNDELIVERED') || s.includes('CANCEL') || s.includes('LOST') || s.includes('DAMAGED')) return null;
  if (s.includes('DELIVERED')) return 'delivered';
  if (/PICKED UP|SHIPPED|IN TRANSIT|OUT FOR DELIVERY|REACHED|DESTINATION|DISPATCHED/.test(s)) return 'shipped';
  if (/PICKUP SCHEDULED|PICKUP GENERATED|AWB ASSIGNED|MANIFEST|PICKUP QUEUED|OUT FOR PICKUP/.test(s)) return 'packed';
  return null;
}
