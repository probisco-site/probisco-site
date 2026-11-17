import { sb, eq } from './supabase.js';
import { notifyNewOrder } from './notify.js';
import { pushOrderToShiprocket } from './shiprocket.js';
import { pushOrderToHQ, retryHQBacklog } from './hq.js';

// Mark an order paid exactly once, then send alerts. Safe to call from both the
// browser confirmation and the Razorpay webhook: only the first call changes anything.
export async function markOrderPaid(env, { razorpayOrderId, razorpayPaymentId, amountPaise, source }) {
  const rows = await sb(env, 'GET', `orders?razorpay_order_id=${eq(razorpayOrderId)}&select=*`);
  const order = rows?.[0];
  if (!order) return { found: false };
  if (amountPaise != null && Number(amountPaise) !== order.total * 100) {
    console.error('Amount mismatch for', order.order_number, amountPaise, order.total);
    await sb(env, 'PATCH', `orders?id=${eq(order.id)}`, { internal_notes: `Amount mismatch: paid ${amountPaise} paise via ${source}` }, 'return=minimal');
    return { found: true, order, mismatch: true };
  }

  const updated = await sb(
    env, 'PATCH',
    `orders?id=${eq(order.id)}&status=${eq('pending')}`,
    { status: 'paid', razorpay_payment_id: razorpayPaymentId, paid_at: new Date().toISOString(), paid_via: source },
    'return=representation'
  );
  const paidNow = updated?.[0];
  if (!paidNow) return { found: true, order, alreadyPaid: true };

  // Send to Shiprocket first so the owner alert can say whether it worked.
  const shiprocket = await pushOrderToShiprocket(env, paidNow);
  const hq = await pushOrderToHQ(env, paidNow);
  try {
    const sent = await notifyNewOrder(env, paidNow, { shiprocket, hq });
    if (sent) await sb(env, 'PATCH', `orders?id=${eq(paidNow.id)}`, { alert_sent: true }, 'return=minimal');
  } catch (e) {
    console.error('Notify failed', e);
  }
  await retryHQBacklog(env);
  return { found: true, order: paidNow, paidNow: true };
}
