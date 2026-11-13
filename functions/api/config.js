import { json } from '../../lib/http.js';

// Tells the checkout whether online payment is set up yet.
// Until the Razorpay keys are added, orders are confirmed on WhatsApp instead.
export async function onRequestGet({ env }) {
  return json({ payments: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) });
}
