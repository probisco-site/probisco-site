import { json, requireEnv } from '../../lib/http.js';
import { findCoupon } from '../../lib/coupons.js';

// GET /api/coupon?code=XYZ  -> { code, discountPerJar } or 404
export async function onRequestGet({ request, env }) {
  try {
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    const code = new URL(request.url).searchParams.get('code');
    const c = await findCoupon(env, code);
    if (!c) return json({ error: "This code isn't valid or has expired." }, 404);
    return json({ code: c.code, discountPerJar: c.discount_per_jar });
  } catch (e) {
    console.error('coupon', e);
    return json({ error: 'Could not check the code right now.' }, 500);
  }
}
