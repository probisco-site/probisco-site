/* Checkout: validate details, create the order on our server, open Razorpay, verify. */
(function () {
  'use strict';
  var PB = window.PB;
  var form = document.getElementById('checkout-form');
  if (!form || !PB) return;

  var errBox = document.getElementById('co-error');
  var payBtn = document.getElementById('pay-btn');
  var payLabel = payBtn.querySelector('[data-pay-label]');
  var summary = document.getElementById('co-summary');
  var empty = document.getElementById('co-empty');
  var busy = false;
  var paymentsOn = true; // switched off below if Razorpay isn't set up yet
  var WA_NUMBER = '918800305043';

  function $(s) { return document.querySelector(s); }
  function render() {
    var p = PB.price(PB.getCart());
    var hasItems = p.qty > 0;
    summary.hidden = !hasItems;
    empty.hidden = hasItems;
    form.querySelectorAll('input, select, textarea, button').forEach(function (el) { el.disabled = !hasItems || busy; });
    if (!hasItems) return;
    $('[data-co-qty]').textContent = p.qty;
    $('[data-co-unit]').textContent = p.qty === 1 ? 'jar' : 'jars';
    $('[data-co-line]').textContent = p.qty + ' × ' + PB.rs(PB.config.price);
    $('[data-co-sub]').textContent = PB.rs(p.subtotal);
    var del = $('[data-co-del]');
    del.textContent = p.delivery ? PB.rs(p.delivery) : 'Free';
    del.style.fontWeight = p.delivery ? '' : '700';
    del.style.color = p.delivery ? '' : '#8A4A1F';
    $('[data-co-save]').textContent = PB.rs(p.savings);
    $('[data-co-disc-row]').hidden = !p.discount;
    if (p.discount) { $('[data-co-disc-label]').textContent = 'Code ' + p.coupon; $('[data-co-disc]').textContent = '−' + PB.rs(p.discount); }
    var cp = PB.getCoupon();
    $('[data-coupon-entry]').hidden = !!cp;
    $('[data-coupon-applied]').hidden = !cp;
    if (cp) { $('[data-coupon-code]').textContent = cp.code; $('[data-coupon-per]').textContent = PB.rs(cp.perJar); }
    $('[data-co-total]').textContent = PB.rs(p.total);
    var left = PB.config.freeFrom - p.qty;
    $('[data-co-hint]').textContent = left > 0 ? 'Add ' + left + ' more ' + (left === 1 ? 'jar' : 'jars') + ' for free delivery.' : 'Free delivery unlocked.';
    $('[data-co-bar]').style.width = Math.min(100, p.qty / PB.config.freeFrom * 100) + '%';
    document.querySelector('[data-co-step="-1"]').disabled = busy || p.qty <= 1;
    document.querySelector('[data-co-step="1"]').disabled = busy || p.qty >= PB.config.max;
    payLabel.textContent = paymentsOn ? 'Pay ' + PB.rs(p.total) + ' securely' : 'Place order · ' + PB.rs(p.total);
  }

  fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
    if (c && c.payments === false) {
      paymentsOn = false;
      var note = document.querySelector('#h-pay + p');
      if (note) note.textContent = 'Online payment is coming soon. Place your order now and we\'ll confirm it with you on WhatsApp, with a UPI payment link. We ship once payment is received.';
      render();
    }
  }).catch(function () {});
  document.querySelectorAll('[data-co-step]').forEach(function (b) {
    b.addEventListener('click', function () { PB.setCart(Math.max(1, PB.getCart() + parseInt(b.getAttribute('data-co-step'), 10))); });
  });
  document.addEventListener('pb:cart', render);

  // Coupon code
  var cForm = document.getElementById('coupon-form');
  var cMsg = $('[data-coupon-msg]');
  cForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var input = cForm.elements.coupon;
    var code = input.value.trim().toUpperCase().replace(/\s+/g, '');
    cMsg.textContent = '';
    if (!code) { cMsg.textContent = 'Enter a code.'; input.focus(); return; }
    var btn = cForm.querySelector('button[type=submit]'); btn.disabled = true;
    PB.checkCoupon(code)
      .then(function (c) { PB.setCoupon(c); input.value = ''; })
      .catch(function (err) { cMsg.textContent = err.message; })
      .finally(function () { btn.disabled = false; });
  });
  $('[data-coupon-remove]').addEventListener('click', function () { PB.setCoupon(null); cMsg.textContent = ''; });

  // Remember typed details in this tab, so a reload or failed payment doesn't lose them.
  var FIELDS = ['name', 'phone', 'email', 'address1', 'address2', 'pincode', 'city', 'state', 'notes'];
  try {
    var saved = JSON.parse(sessionStorage.getItem('pb_checkout') || '{}');
    FIELDS.forEach(function (k) { if (saved[k] && form.elements[k]) form.elements[k].value = saved[k]; });
  } catch (e) {}
  form.addEventListener('input', function () {
    var data = {};
    FIELDS.forEach(function (k) { data[k] = form.elements[k].value; });
    try { sessionStorage.setItem('pb_checkout', JSON.stringify(data)); } catch (e) {}
  });
  form.elements.phone.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
  form.elements.pincode.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 6); });
  try { var pinSaved = localStorage.getItem('pb_pin'); if (pinSaved && !form.elements.pincode.value) form.elements.pincode.value = pinSaved; } catch (e) {}

  function showError(msg) {
    errBox.innerHTML = '';
    if (Array.isArray(msg)) {
      var p = document.createElement('p'); p.textContent = 'Please check the following:'; errBox.appendChild(p);
      var ul = document.createElement('ul'); ul.style.margin = '6px 0 0'; ul.style.paddingLeft = '18px';
      msg.forEach(function (m) { var li = document.createElement('li'); li.textContent = m; ul.appendChild(li); });
      errBox.appendChild(ul);
    } else { errBox.textContent = msg; }
    errBox.hidden = false;
    errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearError() { errBox.hidden = true; errBox.textContent = ''; }

  function validate() {
    var f = form.elements, errs = [], first = null;
    function bad(el, msg) { el.setAttribute('aria-invalid', 'true'); errs.push(msg); if (!first) first = el; }
    FIELDS.forEach(function (k) { f[k].removeAttribute('aria-invalid'); });
    if (f.name.value.trim().length < 2) bad(f.name, 'Enter your full name.');
    if (!/^[6-9]\d{9}$/.test(f.phone.value.trim())) bad(f.phone, 'Enter a valid 10-digit Indian mobile number.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.value.trim())) bad(f.email, 'Enter a valid email address.');
    if (f.address1.value.trim().length < 5) bad(f.address1, 'Enter your house, building and street.');
    if (!/^[1-9]\d{5}$/.test(f.pincode.value.trim())) bad(f.pincode, 'Enter a valid 6-digit pincode.');
    if (f.city.value.trim().length < 2) bad(f.city, 'Enter your city.');
    if (!f.state.value) bad(f.state, 'Select your state.');
    if (!document.getElementById('f-terms').checked) { errs.push('Please accept the terms and policies.'); if (!first) first = document.getElementById('f-terms'); }
    if (errs.length) { showError(errs); if (first) first.focus(); return false; }
    return true;
  }

  function setBusy(b, label) {
    busy = b;
    render();
    if (label) payLabel.textContent = label;
  }

  function loadRazorpay() {
    return new Promise(function (resolve, reject) {
      if (window.Razorpay) return resolve();
      var s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load the payment window. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
  }

  function post(url, data) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || 'Something went wrong. Please try again.'); e.details = j.details; e.couponInvalid = j.couponInvalid; throw e; }
          return j;
        });
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    clearError();
    if (!validate()) return;
    var f = form.elements;
    var payload = {
      qty: PB.getCart(),
      name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(),
      address1: f.address1.value.trim(), address2: f.address2.value.trim(),
      city: f.city.value.trim(), state: f.state.value, pincode: f.pincode.value.trim(),
      notes: f.notes.value.trim(), marketing: document.getElementById('f-optin').checked,
      coupon: PB.getCoupon() ? PB.getCoupon().code : null,
      utm: PB.getUtm()
    };
    setBusy(true, paymentsOn ? 'Preparing payment…' : 'Placing order…');
    Promise.all([post('/api/create-order', payload), paymentsOn ? loadRazorpay() : Promise.resolve()])
      .then(function (res) {
        var o = res[0];
        if (o.mode === 'whatsapp') return whatsappOrder(o, payload);
        if (!window.Razorpay) return loadRazorpay().then(function () { location.reload(); });
        if (window.gtag) { try { window.gtag('event', 'begin_checkout', { currency: 'INR', value: o.amount / 100 }); } catch (x) {} }
        if (window.fbq) { try { window.fbq('track', 'InitiateCheckout', { currency: 'INR', value: o.amount / 100 }); } catch (x) {} }
        var rzp = new window.Razorpay({
          key: o.keyId,
          amount: o.amount,
          currency: 'INR',
          order_id: o.razorpayOrderId,
          name: 'ProBisCo',
          description: o.description,
          image: location.origin + '/assets/img/icon-512.png',
          prefill: { name: payload.name, email: payload.email, contact: '+91' + payload.phone },
          notes: { order_number: o.orderNumber },
          theme: { color: '#311004' },
          modal: {
            ondismiss: function () {
              setBusy(false);
              showError('Payment was not completed. Your details are saved, so you can try again.');
            }
          },
          handler: function (resp) {
            setBusy(true, 'Confirming payment…');
            post('/api/verify-payment', resp)
              .then(function () { finish(o.orderNumber, o.amount); })
              .catch(function (err) {
                if (err.message && /signature/i.test(err.message)) {
                  setBusy(false);
                  showError('We could not verify this payment. If money was debited, message us with order ' + o.orderNumber + ' and we will sort it out.');
                } else {
                  // Network hiccup: Razorpay will still notify our server, so the order will be confirmed.
                  finish(o.orderNumber, o.amount);
                }
              });
          }
        });
        rzp.on('payment.failed', function (r) {
          var msg = (r && r.error && r.error.description) || 'Payment failed.';
          showError(msg + ' No money was taken, or it will be refunded automatically. Please try again.');
        });
        rzp.open();
      })
      .catch(function (err) {
        if (err.couponInvalid) {
          PB.setCoupon(null);
          setBusy(false);
          showError('Your code ' + payload.coupon + ' is no longer valid, so we removed it. Check the new total and place the order again.');
          return;
        }
        setBusy(false);
        showError(err.details && err.details.length ? err.details : err.message);
      });
  });

  function whatsappOrder(o, d) {
    var total = PB.rs(o.amount / 100);
    var msg = [
      'Hi ProBisCo! I just placed order ' + o.orderNumber + ' on probisco.in.',
      o.qty + ' ' + (o.qty === 1 ? 'jar' : 'jars') + ' of chocolate chip protein cookies',
      o.coupon ? 'Code: ' + o.coupon + ' (−' + PB.rs(o.discount) + ')' : '',
      'Total: ' + total + (o.delivery ? ' (incl. ' + PB.rs(o.delivery) + ' delivery)' : ' (free delivery)'),
      '',
      'Name: ' + d.name,
      'Phone: ' + d.phone,
      'Address: ' + [d.address1, d.address2, d.city, d.state + ' ' + d.pincode].filter(Boolean).join(', '),
      '',
      'Please send me the payment link.'
    ].filter(function (l, i, a) { return l !== '' || a[i - 1] !== ''; }).join('\n');
    try { sessionStorage.setItem('pb_wa_msg', 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(msg)); } catch (x) {}
    PB.clearCart();
    try { sessionStorage.removeItem('pb_checkout'); } catch (x) {}
    location.href = '/order-confirmed/?o=' + encodeURIComponent(o.orderNumber) + '&wa=1';
  }

  function finish(orderNumber, amount) {
    if (window.gtag) { try { window.gtag('event', 'purchase', { transaction_id: orderNumber, currency: 'INR', value: amount / 100 }); } catch (x) {} }
    if (window.fbq) { try { window.fbq('track', 'Purchase', { currency: 'INR', value: amount / 100 }); } catch (x) {} }
    PB.clearCart();
    try { sessionStorage.removeItem('pb_checkout'); } catch (x) {}
    location.href = '/order-confirmed/?o=' + encodeURIComponent(orderNumber);
  }

  render();
})();
