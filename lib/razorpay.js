import { hmacSha256Hex, safeEqual } from './crypto.js';

const base = (env) => (env.RAZORPAY_API_BASE || 'https://api.razorpay.com').replace(/\/$/, '');

export async function createRazorpayOrder(env, { amountPaise, receipt, notes }) {
  const res = await fetch(`${base(env)}/v1/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`),
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id) {
    throw new Error('Razorpay order failed: ' + (body?.error?.description || res.status));
  }
  return body; // { id, amount, currency, receipt, status, ... }
}

// Signature sent to the browser after a successful payment.
export async function verifyCheckoutSignature(env, orderId, paymentId, signature) {
  const expected = await hmacSha256Hex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
  return safeEqual(expected, String(signature || ''));
}

// Signature on webhooks (X-Razorpay-Signature header), computed over the raw body.
export async function verifyWebhookSignature(env, rawBody, signature) {
  const expected = await hmacSha256Hex(env.RAZORPAY_WEBHOOK_SECRET, rawBody);
  return safeEqual(expected, String(signature || ''));
}
