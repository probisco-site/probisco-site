import { json, readJson, requireEnv, sameOrigin } from '../../lib/http.js';
import { sb } from '../../lib/supabase.js';

export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env, ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
    if (!sameOrigin(request)) return json({ error: 'Forbidden' }, 403);
    const b = await readJson(request, 2000);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Please enter a valid email.' }, 400);
    await sb(env, 'POST', 'newsletter?on_conflict=email', { email, source: 'footer' }, 'resolution=ignore-duplicates,return=minimal');
    return json({ ok: true });
  } catch (e) {
    console.error('subscribe', e);
    return json({ error: 'Could not subscribe right now. Please try again.' }, 500);
  }
}
