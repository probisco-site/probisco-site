import { sb, eq } from './supabase.js';
import { normalizeCode } from './shop.js';

// Returns the coupon row if the code exists, is active and hasn't expired; otherwise null.
export async function findCoupon(env, raw) {
  const code = normalizeCode(raw);
  if (!code) return null;
  const rows = await sb(env, 'GET', `coupons?code=${eq(code)}&active=is.true&select=code,discount_per_jar,expires_at`);
  const c = rows?.[0];
  if (!c) return null;
  if (c.expires_at && new Date(c.expires_at) < new Date()) return null;
  return c;
}
