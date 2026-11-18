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

async function call(env, path, body, method = 'POST') {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(env, attempt > 0);
    const res = await fetch(`${env.SHIPROCKET_API_BASE || BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: method === 'GET' ? undefined : JSON.stringify(body),
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

// Pincode of our pickup address (looked up once from Shiprocket and cached), unless set directly.
async function pickupPincode(env) {
  if (env.SHIPROCKET_PICKUP_PINCODE) return String(env.SHIPROCKET_PICKUP_PINCODE);
  const rows = await sb(env, 'GET', `app_settings?key=${eq('shiprocket_pickup_pin')}&select=value`);
  if (rows?.[0]?.value) return rows[0].value;
  const j = await call(env, '/settings/company/pickup', null, 'GET');
  const list = j?.data?.shipping_address || [];
  const want = String(env.SHIPROCKET_PICKUP_LOCATION || '').trim().toLowerCase();
  const hit = list.find((a) => String(a.pickup_location || '').trim().toLowerCase() === want) || list[0];
  const pin = hit?.pin_code ? String(hit.pin_code) : null;
  if (pin) await sb(env, 'POST', 'app_settings?on_conflict=key', { key: 'shiprocket_pickup_pin', value: pin, updated_at: new Date().toISOString() }, 'resolution=merge-duplicates,return=minimal');
  return pin;
}

// Can couriers deliver to this pincode, and roughly when? (prepaid, one jar's weight)
export async function checkServiceability(env, pincode) {
  const from = await pickupPincode(env);
  if (!from) throw new Error('Pickup pincode unknown');
  const w = Number(env.SHIPROCKET_WEIGHT_PER_JAR_KG || 0.3) + 0.1;
  const q = `/courier/serviceability/?pickup_postcode=${encodeURIComponent(from)}&delivery_postcode=${encodeURIComponent(pincode)}&weight=${w}&cod=0`;
  let j;
  try { j = await call(env, q, null, 'GET'); }
  catch (e) { if (/404|not serviceable|no courier/i.test(e.message)) return { available: false }; throw e; }
  const list = j?.data?.available_courier_companies || [];
  if (!list.length) return { available: false };
  const rec = list.find((c) => c.courier_company_id === j?.data?.recommended_courier_company_id) || list[0];
  const days = list.map((c) => Number(c.estimated_delivery_days)).filter((n) => n > 0);
  return {
    available: true,
    city: rec.city || null,
    state: rec.state || null,
    minDays: days.length ? Math.min(...days) : null,
    maxDays: Number(rec.estimated_delivery_days) || (days.length ? Math.max(...days) : null),
  };
}

// One-click shipping from HQ: courier (Shiprocket's recommended one), pickup and label.
export async function bookShipment(env, shipmentId) {
  const out = {};
  const a = await call(env, '/courier/assign/awb', { shipment_id: Number(shipmentId) || shipmentId });
  const ad = a?.response?.data || a?.data || {};
  if (!(a?.awb_assign_status === 1 || ad.awb_code)) throw new Error('Shiprocket could not assign a courier: ' + (ad.awb_assign_error || a?.message || 'no courier available'));
  out.awb = String(ad.awb_code || '');
  out.courier = ad.courier_name || null;
  try {
    const pk = await call(env, '/courier/generate/pickup', { shipment_id: [Number(shipmentId) || shipmentId] });
    const pr = pk?.response || {};
    out.pickupDate = pr.pickup_scheduled_date || pr.pickup_date || null;
  } catch (e) { out.pickupError = e.message; }
  try {
    const lb = await call(env, '/courier/generate/label', { shipment_id: [Number(shipmentId) || shipmentId] });
    out.labelUrl = lb?.label_url || null;
  } catch (e) { out.labelError = e.message; }
  return out;
}

export async function cancelShiprocketOrder(env, srOrderId) {
  return call(env, '/orders/cancel', { ids: [Number(srOrderId) || srOrderId] });
}

// Every Shiprocket tracking label, mapped to a step shown in HQ.
export function stageFor(label) {
  const s = String(label || '').toUpperCase();
  if (!s) return 'note';
  if (s.includes('RTO')) return /DELIVERED/.test(s) ? 'returned' : 'returning';
  if (s.includes('CANCEL')) return 'cancelled';
  if (/UNDELIVERED|LOST|DAMAGED|DESTROYED|EXCEPTION|DELAY|MISROUTED/.test(s)) return 'problem';
  if (s.includes('DELIVERED')) return 'delivered';
  if (/PICKED UP|SHIPPED|IN TRANSIT|OUT FOR DELIVERY|REACHED|DESTINATION|DISPATCHED/.test(s)) return 'shipped';
  if (/PICKUP|AWB ASSIGNED|MANIFEST|LABEL/.test(s)) return 'packed';
  return 'note';
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
