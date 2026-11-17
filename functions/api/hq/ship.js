// POST /api/hq/ship {number} — the "Ship" button in ProBisCo HQ.
// Books the courier Shiprocket recommends, schedules the pickup and makes the label.
import { sb, eq } from '../../../lib/supabase.js';
import { shiprocketEnabled, createShiprocketOrder, bookShipment } from '../../../lib/shiprocket.js';
import { hqEvent } from '../../../lib/hq.js';
import { reply, preflight, guard } from '../../../lib/hqapi.js';

export const onRequestOptions = preflight;

export async function onRequestPost({ request, env }) {
  try {
    if (!shiprocketEnabled(env)) return reply({ error: 'Shiprocket isn\'t set up on the website yet.' }, 400);
    const g = await guard(env, request);
    if (g.error) return g.error;
    let o = g.order;
    if (!['paid', 'packed'].includes(o.status)) {
      return reply({ error: `This order is ${o.status}, so it can't be shipped.` }, 409);
    }
    if (o.awb) {
      return reply({ ok: true, already: true, awb: o.awb, courier: o.courier, labelUrl: o.label_url, trackingUrl: o.tracking_url, pickupDate: o.pickup_date });
    }

    // Make sure Shiprocket has the order (it normally does, from the moment it was paid).
    if (!o.shiprocket_shipment_id) {
      const r = await createShiprocketOrder(env, o);
      const rows = await sb(env, 'PATCH', `orders?id=${eq(o.id)}`,
        { shiprocket_order_id: r.shiprocketOrderId, shiprocket_shipment_id: r.shipmentId, shiprocket_error: null }, 'return=representation');
      o = rows?.[0] || { ...o, shiprocket_order_id: r.shiprocketOrderId, shiprocket_shipment_id: r.shipmentId };
    }

    const b = await bookShipment(env, o.shiprocket_shipment_id);
    const patch = {
      status: 'packed', awb: b.awb, courier: b.courier, label_url: b.labelUrl || null, pickup_date: b.pickupDate || null,
      tracking_url: b.awb ? `https://shiprocket.co/tracking/${encodeURIComponent(b.awb)}` : null,
      courier_status: 'Courier booked',
    };
    const rows = await sb(env, 'PATCH', `orders?id=${eq(o.id)}`, patch, 'return=representation');
    const updated = rows?.[0] || { ...o, ...patch };
    await hqEvent(env, updated, 'packed', {
      label: `Courier booked by ${g.user.name || g.user.email}: ${b.courier || 'courier'}` + (b.pickupDate ? `, pickup ${b.pickupDate}` : ''),
    });
    return reply({
      ok: true, awb: b.awb, courier: b.courier, labelUrl: b.labelUrl, trackingUrl: patch.tracking_url,
      pickupDate: b.pickupDate, warnings: [b.pickupError, b.labelError].filter(Boolean),
    });
  } catch (e) {
    console.error('hq ship', e);
    return reply({ error: e.message || 'Could not book the courier.' }, 502);
  }
}
