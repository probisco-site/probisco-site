// POST /api/hq/cancel {number, refund: true|false, reason} — owners only.
// Cancels a website order that hasn't been picked up yet: cancels it in Shiprocket,
// optionally refunds the full amount through Razorpay, emails the customer and updates HQ.
import { sb, eq } from '../../../lib/supabase.js';
import { shiprocketEnabled, cancelShiprocketOrder } from '../../../lib/shiprocket.js';
import { hqEvent } from '../../../lib/hq.js';
import { notifyCancelled } from '../../../lib/notify.js';
import { reply, preflight, guard } from '../../../lib/hqapi.js';

export const onRequestOptions = preflight;

async function refundPayment(env, paymentId, amountPaise, notes) {
  const base = (env.RAZORPAY_API_BASE || 'https://api.razorpay.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`) },
    body: JSON.stringify({ amount: amountPaise, speed: 'normal', notes }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.id) throw new Error('Razorpay refund failed: ' + (j?.error?.description || res.status));
  return j;
}

export async function onRequestPost({ request, env }) {
  try {
    const g = await guard(env, request, { ownerOnly: true });
    if (g.error) return g.error;
    const o = g.order;
    const reason = String(g.body.reason || '').trim().slice(0, 200);
    const wantRefund = g.body.refund === true;

    if (['cancelled', 'refunded'].includes(o.status)) return reply({ error: `This order is already ${o.status}.` }, 409);
    if (['shipped', 'delivered'].includes(o.status)) {
      return reply({ error: 'The courier already has this parcel. Ask Shiprocket for a return (RTO) instead; HQ updates by itself when it comes back.' }, 409);
    }

    // 1. Shiprocket
    if (o.shiprocket_order_id && shiprocketEnabled(env)) {
      try { await cancelShiprocketOrder(env, o.shiprocket_order_id); }
      catch (e) { return reply({ error: 'Shiprocket would not cancel it: ' + e.message }, 502); }
    }

    // 2. Refund (only if asked, and only for orders paid online)
    let refund = null;
    if (wantRefund) {
      if (!o.razorpay_payment_id) return reply({ error: 'This order wasn\'t paid through Razorpay, so there is nothing to refund here.' }, 400);
      refund = await refundPayment(env, o.razorpay_payment_id, o.total * 100, { order: o.order_number, reason: reason || 'Cancelled' });
    }

    // 3. Website order
    const patch = {
      status: refund ? 'refunded' : 'cancelled', cancelled_at: new Date().toISOString(), refund_id: refund?.id || null,
      internal_notes: [o.internal_notes, `Cancelled in HQ by ${g.user.name || g.user.email}` + (reason ? `: ${reason}` : '') + (refund ? ` · refund ${refund.id}` : '')].filter(Boolean).join('\n'),
    };
    const rows = await sb(env, 'PATCH', `orders?id=${eq(o.id)}`, patch, 'return=representation');
    const updated = rows?.[0] || { ...o, ...patch };

    // 4. HQ timeline, 5. customer email
    await hqEvent(env, updated, 'cancelled', { label: `Cancelled by ${g.user.name || g.user.email}`, detail: reason || null });
    if (refund) await hqEvent(env, updated, 'refunded', { label: `Refunded ₹${o.total} to the customer`, detail: refund.id });
    await notifyCancelled(env, updated, { refunded: Boolean(refund), amount: o.total }).catch((e) => console.error(e));

    return reply({ ok: true, status: updated.status, refundId: refund?.id || null });
  } catch (e) {
    console.error('hq cancel', e);
    return reply({ error: e.message || 'Could not cancel the order.' }, 502);
  }
}
