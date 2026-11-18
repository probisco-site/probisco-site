// POST /api/review — a customer submits a review. It stays hidden until approved in Supabase.
import { json, readJson, sameOrigin } from '../../lib/http.js';
import { sb, eq } from '../../lib/supabase.js';
import { notifyNewReview } from '../../lib/notify.js';

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const star = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };

export async function onRequestPost({ request, env }) {
  try {
    if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);
    const b = await readJson(request, 6000);
    if (b.company) return json({ ok: true }); // bots fill the hidden field

    const r = {
      name: clean(b.name, 60), city: clean(b.city, 60) || null,
      rating_overall: star(b.overall), rating_taste: star(b.taste), rating_crunch: star(b.crunch),
      body: String(b.text ?? '').trim().slice(0, 800) || null,
      consent: b.consent === true, source: 'website', status: 'pending',
    };
    const errors = [];
    if (!r.name) errors.push('Add your name.');
    if (!r.rating_overall) errors.push('Choose an overall rating.');
    if (!r.consent) errors.push('Tick the box so we can show your review.');
    if (errors.length) return json({ error: errors.join(' '), details: errors }, 400);

    // Link to an order when the order number and phone match: shown as "Verified buyer".
    const order = clean(b.order, 20).toUpperCase();
    const phone = clean(b.phone, 15).replace(/\D/g, '').slice(-10);
    if (order && phone) {
      const rows = await sb(env, 'GET', `orders?order_number=${eq(order)}&phone=${eq(phone)}&status=in.(paid,packed,shipped,delivered)&select=order_number`);
      if (rows?.[0]) { r.order_number = order; r.verified = true; }
    }
    if (phone) r.contact = phone;

    await sb(env, 'POST', 'reviews', r, 'return=minimal');
    await notifyNewReview(env, r).catch((e) => console.error(e));
    return json({ ok: true, verified: Boolean(r.verified) });
  } catch (e) {
    console.error('review', e);
    return json({ error: 'Could not send your review. Please try again.' }, 500);
  }
}
