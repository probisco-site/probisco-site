import { json, requireEnv } from '../../lib/http.js';
import { sb, eq } from '../../lib/supabase.js';

export async function onRequestGet({ request, env }) {
  try {
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const u = new URL(request.url);
    const order = (u.searchParams.get('order') || '').trim().toUpperCase().slice(0, 20);
    const phone = (u.searchParams.get('phone') || '').replace(/\D/g, '').slice(-10);
    if (!/^PB[0-9A-Z-]{4,20}$/.test(order) || !/^[6-9]\d{9}$/.test(phone)) {
      return json({ error: 'Enter your order number and 10-digit mobile number.' }, 400);
    }
    const rows = await sb(env, 'GET',
      `orders?order_number=${eq(order)}&phone=${eq(phone)}&status=neq.pending` +
      '&select=order_number,status,quantity,total,created_at,paid_at,shipped_at,delivered_at,courier,tracking_url');
    const o = rows?.[0];
    if (!o) return json({ error: "We couldn't find a paid order with those details. Check the order number in your confirmation email." }, 404);
    return json({
      orderNumber: o.order_number, status: o.status, quantity: o.quantity, total: o.total,
      createdAt: o.created_at, paidAt: o.paid_at, shippedAt: o.shipped_at, deliveredAt: o.delivered_at,
      courier: o.courier, trackingUrl: o.tracking_url,
    });
  } catch (e) {
    console.error('track', e);
    return json({ error: 'Could not check right now. Please try again.' }, 500);
  }
}
