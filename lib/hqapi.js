// Shared bits for the endpoints ProBisCo HQ calls (Ship, Cancel).
// HQ runs on another domain, so these allow cross-site calls; every call must carry
// the HQ user's sign-in token, which is checked against HQ's team list.
import { hqUser } from './hq.js';
import { sb, eq } from './supabase.js';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

export function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
  });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export async function guard(env, request, { ownerOnly = false } = {}) {
  const user = await hqUser(env, request).catch(() => null);
  if (!user) return { error: reply({ error: 'Sign in to ProBisCo HQ first.' }, 401) };
  if (ownerOnly && user.role !== 'owner') return { error: reply({ error: 'Only an owner can do this.' }, 403) };
  let body = {};
  try { body = JSON.parse((await request.text()) || '{}'); } catch { return { error: reply({ error: 'Invalid request.' }, 400) }; }
  const number = String(body.number || '').trim().toUpperCase();
  if (!/^PB\d{6}-\d{4}$/.test(number)) return { error: reply({ error: 'Not a website order number.' }, 400) };
  const rows = await sb(env, 'GET', `orders?order_number=${eq(number)}&select=*`);
  if (!rows?.[0]) return { error: reply({ error: 'Order not found on the website.' }, 404) };
  return { user, body, order: rows[0] };
}
