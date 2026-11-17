import { json, readJson, requireEnv, sameOrigin } from '../../lib/http.js';
import { validateCheckout, priceOrder, newOrderNumber, PRODUCT } from '../../lib/shop.js';
import { createRazorpayOrder } from '../../lib/razorpay.js';
import { sb } from '../../lib/supabase.js';
import { findCoupon } from '../../lib/coupons.js';

export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const paymentsOn = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
    if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);

    const body = await readJson(request);
    const { data, errors } = validateCheckout(body);
    if (errors) return json({ error: 'Please check your details.', details: errors }, 400);

    let coupon = null;
    if (data.couponGiven) {
      coupon = await findCoupon(env, data.coupon);
      if (!coupon) return json({ error: "That coupon code isn't valid or has expired. Remove it or try another." , couponInvalid: true }, 400);
    }
    const p = priceOrder(data.qty, coupon); // never trust prices from the browser

    // Insert the order first (status: pending), retrying if the order number clashes.
    let order;
    for (let attempt = 0; attempt < 4 && !order; attempt++) {
      try {
        const rows = await sb(env, 'POST', 'orders', {
          order_number: newOrderNumber(),
          status: 'pending',
          sku: PRODUCT.sku,
          quantity: p.qty,
          unit_price: p.unitPrice,
          subtotal: p.subtotal,
          discount: p.discount,
          coupon_code: p.couponCode,
          utm_source: data.utmSource,
          utm_medium: data.utmMedium,
          utm_campaign: data.utmCampaign,
          delivery_fee: p.delivery,
          total: p.total,
          customer_name: data.name,
          phone: data.phone,
          email: data.email,
          address_line1: data.address1,
          address_line2: data.address2 || null,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          notes: data.notes || null,
          marketing_opt_in: data.marketing,
          paid_via: paymentsOn ? null : 'whatsapp',
        }, 'return=representation');
        order = rows[0];
      } catch (e) {
        if (e.code !== '23505') throw e; // 23505 = unique violation, try a new number
      }
    }
    if (!order) throw new Error('Could not create an order number');

    if (data.marketing) {
      sb(env, 'POST', 'newsletter?on_conflict=email', { email: data.email, source: 'checkout' }, 'resolution=ignore-duplicates,return=minimal').catch(() => {});
    }

    // Online payment not set up yet: the order is saved, and confirmed on WhatsApp.
    if (!paymentsOn) {
      return json({ mode: 'whatsapp', orderNumber: order.order_number, amount: p.total * 100, qty: p.qty, delivery: p.delivery, discount: p.discount, coupon: p.couponCode });
    }

    let rzp;
    try {
      rzp = await createRazorpayOrder(env, {
        amountPaise: p.total * 100,
        receipt: order.order_number,
        notes: { order_number: order.order_number, jars: String(p.qty), phone: data.phone, coupon: p.couponCode || '' },
      });
    } catch (e) {
      // Keep Razorpay's reason on the order so it can be checked later (no keys are stored).
      const keyKind = String(env.RAZORPAY_KEY_ID).startsWith('rzp_live_') ? 'live' : String(env.RAZORPAY_KEY_ID).startsWith('rzp_test_') ? 'test' : 'unrecognised';
      await sb(env, 'PATCH', `orders?id=eq.${order.id}`, { internal_notes: `${e.message} (key id type: ${keyKind}, length ${String(env.RAZORPAY_KEY_ID).trim().length}${String(env.RAZORPAY_KEY_ID) !== String(env.RAZORPAY_KEY_ID).trim() || String(env.RAZORPAY_KEY_SECRET) !== String(env.RAZORPAY_KEY_SECRET).trim() ? ', has extra spaces' : ''})` }, 'return=minimal').catch(() => {});
      throw e;
    }
    await sb(env, 'PATCH', `orders?id=eq.${order.id}`, { razorpay_order_id: rzp.id }, 'return=minimal');

    return json({
      mode: 'razorpay',
      orderNumber: order.order_number,
      razorpayOrderId: rzp.id,
      amount: p.total * 100,
      keyId: env.RAZORPAY_KEY_ID,
      description: `${p.qty} ${p.qty === 1 ? 'jar' : 'jars'} · Chocolate chip protein cookies`,
    });
  } catch (e) {
    console.error('create-order', e);
    return json({ error: 'We could not start the payment. Please try again, or message us on WhatsApp.' }, 500);
  }
}
