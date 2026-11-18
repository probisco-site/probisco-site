// GET /api/reviews — approved reviews for the website (no private details).
import { json } from '../../lib/http.js';
import { sb } from '../../lib/supabase.js';

function shortName(n) {
  const parts = String(n || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

export async function onRequestGet({ env }) {
  try {
    const rows = await sb(env, 'GET',
      'reviews?status=eq.approved&consent=is.true&order=created_at.desc&limit=30&select=name,city,rating_overall,rating_taste,rating_crunch,body,verified,source,created_at');
    const reviews = (rows || []).map((r) => ({
      name: shortName(r.name), city: r.city || null, rating: r.rating_overall, taste: r.rating_taste, crunch: r.rating_crunch,
      text: r.body || '', verified: r.verified, inPerson: r.source === 'in_person', date: r.created_at,
    }));
    const avg = reviews.length ? Math.round(reviews.reduce((a, r) => a + r.rating, 0) / reviews.length * 10) / 10 : null;
    return json({ count: reviews.length, average: avg, reviews }, 200, { 'Cache-Control': 'public, max-age=300' });
  } catch (e) {
    console.error('reviews', e);
    return json({ count: 0, average: null, reviews: [] });
  }
}
