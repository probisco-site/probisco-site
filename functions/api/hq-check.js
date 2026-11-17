// Health check: is the website connected to ProBisCo HQ? Shares no data.
import { json } from '../../lib/http.js';
import { hqEnabled, hqOrderStatus } from '../../lib/hq.js';

export async function onRequestGet({ env }) {
  if (!hqEnabled(env)) return json({ configured: false, connected: false });
  const r = await hqOrderStatus(env, { order_number: '__connection_check__' }, 'check');
  const connected = r && r.found === false;
  return json({ configured: true, connected, error: connected ? undefined : (r?.error || 'Unexpected reply') });
}
