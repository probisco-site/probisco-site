// Minimal Supabase REST (PostgREST) client using the service role key.
// The service role key must ONLY live in server-side environment variables.
export async function sb(env, method, path, body, prefer) {
  const url = env.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + path;
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error('Database error: ' + (data?.message || res.status));
    err.status = res.status;
    err.code = data?.code;
    throw err;
  }
  return data;
}

export const eq = (v) => 'eq.' + encodeURIComponent(v);
