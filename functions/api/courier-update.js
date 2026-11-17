// Shiprocket tracking webhook. Set it up in Shiprocket > Settings > API > Webhooks with
// URL https://probisco.in/api/courier-update and the same token as SHIPROCKET_WEBHOOK_TOKEN.
// (Shiprocket rejects URLs containing words like "shiprocket" or "sr", hence the name.)
import { json } from '../../lib/http.js';
import { sb, eq } from '../../lib/supabase.js';
import { safeEqual } from '../../lib/crypto.js';
import { mapCourierStatus, stageFor } from '../../lib/shiprocket.js';
import { notifyShipped, notifyDelivered } from '../../lib/notify.js';
import { hqEvent } from '../../lib/hq.js';

const RANK = { pending: -1, paid: 0, packed: 1, shipped: 2, delivered: 3 };

export async function onRequestPost({ request, env }) {
  const token = request.headers.get('x-api-key') || '';
  if (!env.SHIPROCKET_WEBHOOK_TOKEN || !safeEqual(token, env.SHIPROCKET_WEBHOOK_TOKEN)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  let p = {};
  try { p = JSON.parse(await request.text()); } catch { return json({ ok: true }); }

  try {
    const awb = p.awb ? String(p.awb) : null;
    const label = p.current_status || p.shipment_status || '';
    const orderRef = p.order_id ? String(p.order_id) : null;
    const srOrderId = p.sr_order_id ? String(p.sr_order_id) : null;

    // Find our order: by AWB, then by our order number, then by Shiprocket's order id.
    let order = null;
    const tries = [
      awb && `awb=${eq(awb)}`,
      orderRef && `order_number=${eq(orderRef)}`,
      srOrderId && `shiprocket_order_id=${eq(srOrderId)}`,
    ].filter(Boolean);
    for (const q of tries) {
      const rows = await sb(env, 'GET', `orders?${q}&select=*`);
      if (rows?.[0]) { order = rows[0]; break; }
    }

    await sb(env, 'POST', 'courier_events',
      { order_number: order?.order_number || orderRef, awb, status: String(label).slice(0, 80), payload: p },
      'return=minimal').catch(() => {});
    if (!order) return json({ ok: true, matched: false });

    const patch = { courier_status: String(label).slice(0, 80) || null };
    if (awb) { patch.awb = awb; patch.tracking_url = `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`; }
    if (p.courier_name) patch.courier = String(p.courier_name).slice(0, 80);

    const next = mapCourierStatus(label);
    const moveForward = next && !['cancelled', 'refunded'].includes(order.status) && RANK[next] > (RANK[order.status] ?? -1);
    if (moveForward) patch.status = next;
    const stage = stageFor(label);
    if ((stage === 'returned' || stage === 'cancelled') && !['cancelled', 'refunded'].includes(order.status)) {
      patch.status = 'cancelled'; patch.cancelled_at = new Date().toISOString();
    }

    const rows = await sb(env, 'PATCH', `orders?id=${eq(order.id)}`, patch, 'return=representation');
    const updated = rows?.[0] || { ...order, ...patch };

    if (moveForward && next === 'shipped') await notifyShipped(env, updated).catch((e) => console.error(e));
    if (moveForward && next === 'delivered') await notifyDelivered(env, updated).catch((e) => console.error(e));
    // Every courier update goes to HQ's timeline for this order.
    const lastScan = Array.isArray(p.scans) && p.scans.length ? p.scans[p.scans.length - 1] : null;
    await hqEvent(env, updated, stage, {
      label: String(label || '').slice(0, 120) || null,
      location: lastScan?.location ? String(lastScan.location).slice(0, 120) : null,
    });
    return json({ ok: true, matched: true, status: updated.status });
  } catch (e) {
    console.error('courier-update', e);
    return json({ ok: true, error: 'logged' }); // always 200 so Shiprocket keeps the webhook active
  }
}
