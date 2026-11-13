import { json, readJson, requireEnv, sameOrigin } from '../../lib/http.js';
import { verifyCheckoutSignature } from '../../lib/razorpay.js';
import { markOrderPaid } from '../../lib/orders.js';

// Called by the browser right after Razorpay reports success.
export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env, ['RAZORPAY_KEY_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);
    const b = await readJson(request);
    const orderId = String(b.razorpay_order_id || '');
    const paymentId = String(b.razorpay_payment_id || '');
    const ok = orderId && paymentId && (await verifyCheckoutSignature(env, orderId, paymentId, b.razorpay_signature));
    if (!ok) return json({ error: 'Payment signature could not be verified.' }, 400);

    const r = await markOrderPaid(env, { razorpayOrderId: orderId, razorpayPaymentId: paymentId, source: 'checkout' });
    if (!r.found) return json({ error: 'Order not found.' }, 404);
    return json({ ok: true, orderNumber: r.order.order_number });
  } catch (e) {
    console.error('verify-payment', e);
    return json({ error: 'Could not confirm right now.' }, 500);
  }
}
