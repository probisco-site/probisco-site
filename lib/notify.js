// Order notifications: email via Resend, optional Telegram. All optional; failures never block an order.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rs = (n) => '₹' + Number(n).toLocaleString('en-IN');

function addressLines(o) {
  return [o.address_line1, o.address_line2, `${o.city}, ${o.state} ${o.pincode}`].filter(Boolean);
}

async function sendEmail(env, { to, subject, html, text, replyTo }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM || !to) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: Array.isArray(to) ? to : [to], subject, html, text, reply_to: replyTo }),
  });
  if (!res.ok) console.error('Email failed', res.status, await res.text().catch(() => ''));
  return res.ok;
}

async function sendTelegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  if (!res.ok) console.error('Telegram failed', res.status);
  return res.ok;
}

export async function notifyNewOrder(env, o) {
  const jars = `${o.quantity} ${o.quantity === 1 ? 'jar' : 'jars'}`;
  const lines = [
    `New ProBisCo order ${o.order_number}`,
    `${jars} · ${rs(o.total)} paid (delivery ${o.delivery_fee ? rs(o.delivery_fee) : 'free'})`,
    '',
    `${o.customer_name} · ${o.phone} · ${o.email}`,
    ...addressLines(o),
    o.notes ? `Note: ${o.notes}` : '',
    '',
    `Razorpay payment: ${o.razorpay_payment_id || '-'}`,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
  const text = lines.join('\n');

  const ownerTo = (env.ORDER_ALERT_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ownerHtml = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#311004">
<h2 style="margin:0 0 8px">New order ${esc(o.order_number)}</h2>
<p style="margin:0 0 12px"><b>${esc(jars)}</b> · <b>${esc(rs(o.total))}</b> paid (delivery ${o.delivery_fee ? esc(rs(o.delivery_fee)) : 'free'})</p>
<p style="margin:0 0 12px"><b>${esc(o.customer_name)}</b><br>${esc(o.phone)} · ${esc(o.email)}<br>${addressLines(o).map(esc).join('<br>')}</p>
${o.notes ? `<p style="margin:0 0 12px">Note: ${esc(o.notes)}</p>` : ''}
<p style="color:#6B4A38;font-size:13px">Razorpay payment ${esc(o.razorpay_payment_id || '-')}. Mark it packed and shipped in Supabase or the CRM once dispatched.</p></div>`;

  const site = (env.SITE_URL || '').replace(/\/$/, '');
  const custHtml = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#311004;max-width:560px">
<h2 style="margin:0 0 8px">Thanks for your order, ${esc(o.customer_name.split(' ')[0])}!</h2>
<p>Your ProBisCo order <b>${esc(o.order_number)}</b> is confirmed.</p>
<table style="width:100%;border-collapse:collapse;font-size:15px;margin:12px 0">
<tr><td style="padding:6px 0">Chocolate chip protein cookies × ${o.quantity}</td><td style="text-align:right">${esc(rs(o.subtotal))}</td></tr>
<tr><td style="padding:6px 0">Delivery</td><td style="text-align:right">${o.delivery_fee ? esc(rs(o.delivery_fee)) : 'Free'}</td></tr>
<tr><td style="padding:6px 0;border-top:1px solid #EADBC4"><b>Total paid</b></td><td style="text-align:right;border-top:1px solid #EADBC4"><b>${esc(rs(o.total))}</b></td></tr>
</table>
<p><b>Delivering to</b><br>${esc(o.customer_name)}<br>${addressLines(o).map(esc).join('<br>')}</p>
<p>We pack and dispatch within 1 to 2 business days and will send your tracking link once it ships.${site ? ` You can also <a href="${site}/track-order/?o=${encodeURIComponent(o.order_number)}">track your order here</a>.` : ''}</p>
<p style="color:#6B4A38;font-size:13px">Our cookies are crunchy, so a few may crack in transit. Broken cookies are safe to eat and aren't eligible for return. If a jar arrives with its seal broken, or jars are missing, reply within 48 hours with an unboxing video.</p>
<p>Questions? Just reply to this email or WhatsApp us on +91 88003 05043.</p>
<p>Team ProBisCo</p></div>`;

  const results = await Promise.allSettled([
    sendEmail(env, { to: ownerTo, subject: `New order ${o.order_number} · ${jars} · ${rs(o.total)}`, html: ownerHtml, text, replyTo: o.email }),
    sendTelegram(env, text),
    sendEmail(env, { to: o.email, subject: `Your ProBisCo order ${o.order_number} is confirmed`, html: custHtml, replyTo: env.SUPPORT_EMAIL || undefined }),
  ]);
  return results.some((r) => r.status === 'fulfilled' && r.value);
}
