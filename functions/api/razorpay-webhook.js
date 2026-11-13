import { json, requireEnv } from '../../lib/http.js';
import { verifyWebhookSignature } from '../../lib/razorpay.js';
import { markOrderPaid } from '../../lib/orders.js';

// Razorpay calls this for payment.captured and order.paid events.
// It confirms orders even if the customer closed the browser before the redirect.
export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env, ['RAZORPAY_WEBHOOK_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const raw = await request.text();
    const valid = await verifyWebhookSignature(env, raw, request.headers.get('X-Razorpay-Signature'));
    if (!valid) return json({ error: 'Invalid signature' }, 400);

    const evt = JSON.parse(raw);
    if (evt.event !== 'payment.captured' && evt.event !== 'order.paid') return json({ ok: true, ignored: evt.event });

    const pay = evt.payload?.payment?.entity;
    if (!pay?.order_id) return json({ ok: true, ignored: 'no order id' });

    const r = await markOrderPaid(env, {
      razorpayOrderId: pay.order_id,
      razorpayPaymentId: pay.id,
      amountPaise: pay.amount,
      source: 'webhook',
    });
    return json({ ok: true, found: r.found, paidNow: !!r.paidNow });
  } catch (e) {
    console.error('webhook', e);
    // A 500 makes Razorpay retry later, which is what we want for temporary errors.
    return json({ error: 'Temporary error' }, 500);
  }
}
