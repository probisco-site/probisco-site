// ProBisCo HQ: copy paid website orders into the HQ app (its own Supabase project),
// and pass courier updates on. Needs one Cloudflare secret, HQ_SUPABASE_SECRET_KEY
// (HQ's Supabase secret key). HQ_SUPABASE_URL is optional and defaults to HQ's project.
import { sb, eq } from './supabase.js';
import { PRODUCT } from './shop.js';

const DEFAULT_HQ_URL = 'https://gqgtxkcdiwecsmwrvmcq.supabase.co';

export const hqEnabled = (env) => Boolean(env.HQ_SUPABASE_SECRET_KEY);

async function rpc(env, fn, body) {
  const key = env.HQ_SUPABASE_SECRET_KEY;
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  // Legacy service_role keys are JWTs and also go in Authorization; new sb_secret_ keys don't.
  if (!key.startsWith('sb_')) headers.Authorization = 'Bearer ' + key;
  const res = await fetch((env.HQ_SUPABASE_URL || DEFAULT_HQ_URL).replace(/\/$/, '') + '/rest/v1/rpc/' + fn, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error('HQ: ' + (data?.message || res.status));
  return data;
}

function payload(o) {
  const addr = [o.address_line1, o.address_line2, `${o.city} ${o.pincode}`, o.state].filter(Boolean).join(', ');
  return {
    number: o.order_number,
    name: o.customer_name,
    phone: o.phone,
    email: o.email,
    city: o.city,
    area: o.address_line2 || null,
    ship_to: `${o.customer_name}, ${addr} · ${o.phone}`,
    qty: o.quantity,
    unit_price: o.unit_price,
    discount: o.discount || 0,
    coupon: o.coupon_code || null,
    shipping: o.delivery_fee || 0,
    payment_ref: o.razorpay_payment_id || null,
    sku: o.sku || PRODUCT.sku,
    paid_at: o.paid_at,
    note: o.notes || null,
    marketing: Boolean(o.marketing_opt_in),
    source: o.utm_source ? [o.utm_source, o.utm_campaign].filter(Boolean).join(' / ') : null,
  };
}

// Send one paid order to HQ and record the result on the website order. Never throws.
export async function pushOrderToHQ(env, o) {
  if (!hqEnabled(env)) return { skipped: true };
  try {
    const r = await rpc(env, 'web_sync_order', { p: payload(o) });
    await sb(env, 'PATCH', `orders?id=${eq(o.id)}`, { hq_synced: true, hq_error: null }, 'return=minimal');
    return { ok: true, ...r };
  } catch (e) {
    console.error('HQ push', e);
    await sb(env, 'PATCH', `orders?id=${eq(o.id)}`, { hq_error: String(e.message).slice(0, 500) }, 'return=minimal').catch(() => {});
    return { ok: false, error: e.message };
  }
}

// Retry a few paid orders that didn't reach HQ earlier (e.g. before the key was added).
export async function retryHQBacklog(env, limit = 5) {
  if (!hqEnabled(env)) return;
  try {
    const rows = await sb(env, 'GET',
      `orders?hq_synced=is.false&status=in.(paid,packed,shipped,delivered)&paid_at=not.is.null&order=paid_at.asc&limit=${limit}&select=*`);
    for (const o of rows || []) {
      const r = await pushOrderToHQ(env, o);
      if (r.ok && ['shipped', 'delivered'].includes(o.status)) await hqOrderStatus(env, o, o.status);
    }
  } catch (e) { console.error('HQ backlog', e); }
}

// Pass a courier update on to HQ. Never throws.
export async function hqOrderStatus(env, o, status) {
  if (!hqEnabled(env)) return { skipped: true };
  try {
    return await rpc(env, 'web_order_status', {
      p_number: o.order_number, p_status: status, p_courier: o.courier || null,
      p_awb: o.awb || null, p_tracking: o.tracking_url || null,
    });
  } catch (e) {
    console.error('HQ status', e);
    return { ok: false, error: e.message };
  }
}
