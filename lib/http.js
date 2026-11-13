export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export async function readJson(request, maxBytes = 10_000) {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error('Request too large');
  try { return JSON.parse(text || '{}'); } catch { throw new Error('Invalid JSON'); }
}

export function requireEnv(env, names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) throw new Error('Server is missing settings: ' + missing.join(', '));
}

// Only accept browser POSTs from our own site (basic CSRF protection).
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser clients
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}
