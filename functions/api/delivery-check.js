// GET /api/delivery-check?pincode=110058 — can we deliver there, and roughly when?
// Uses Shiprocket's courier check; answers are cached for a day per pincode.
import { json } from '../../lib/http.js';
import { shiprocketEnabled, checkServiceability } from '../../lib/shiprocket.js';

const DISPATCH_DAYS = 1; // we hand parcels to the courier within 1 to 2 business days

function addDays(n) {
  const d = new Date(Date.now() + 330 * 60000); // IST
  d.setUTCDate(d.getUTCDate() + n);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export async function onRequestGet({ request, env, waitUntil }) {
  const pin = new URL(request.url).searchParams.get('pincode') || '';
  if (!/^[1-9]\d{5}$/.test(pin)) return json({ error: 'Enter a valid 6-digit pincode.' }, 400);

  const cacheKey = new Request(`https://cache.probisco.in/delivery/${pin}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) { const hit = await cache.match(cacheKey); if (hit) return hit; }

  let out;
  if (!shiprocketEnabled(env)) {
    out = { pincode: pin, available: null, message: 'We deliver across India. Most orders arrive in 3 to 7 days.' };
  } else {
    try {
      const r = await checkServiceability(env, pin);
      if (!r.available) {
        out = { pincode: pin, available: false, message: 'Our couriers don\'t reach this pincode yet. Message us on WhatsApp and we\'ll find a way.' };
      } else {
        const lo = (r.minDays || 3) + DISPATCH_DAYS, hi = (r.maxDays || r.minDays || 5) + DISPATCH_DAYS + 1;
        out = {
          pincode: pin, available: true, place: [r.city, r.state].filter(Boolean).join(', ') || null,
          from: addDays(lo), to: addDays(Math.max(hi, lo)),
          message: `Delivers to ${pin}${r.city ? ' (' + r.city + ')' : ''}. Estimated arrival ${addDays(lo)}${hi > lo ? ' to ' + addDays(hi) : ''}.`,
        };
      }
    } catch (e) {
      console.error('delivery-check', e);
      return json({ pincode: pin, available: null, message: 'We deliver across India. Most orders arrive in 3 to 7 days.' });
    }
  }
  const res = json(out, 200, { 'Cache-Control': 'public, max-age=86400' });
  if (cache && out.available !== null) waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
