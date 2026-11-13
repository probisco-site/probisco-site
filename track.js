/* Order tracking lookup */
(function () {
  'use strict';
  var form = document.getElementById('track-form');
  if (!form) return;
  var err = document.getElementById('t-err');
  var out = document.getElementById('t-result');
  var o = new URLSearchParams(location.search).get('o');
  if (o) form.elements.order.value = o;
  form.elements.phone.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });

  var STEPS = [['paid', 'Order placed', 'Payment received'], ['packed', 'Packed', 'Your jars are boxed and ready'], ['shipped', 'Shipped', 'On the way with our courier partner'], ['delivered', 'Delivered', 'Enjoy your cookies']];
  var RANK = { paid: 0, packed: 1, shipped: 2, delivered: 3 };

  function fmt(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }

  function show(d) {
    out.innerHTML = '';
    out.appendChild(el('p', 'Order ' + d.orderNumber, 'eyebrow'));
    out.appendChild(el('p', d.quantity + (d.quantity === 1 ? ' jar' : ' jars') + ' · ₹' + Number(d.total).toLocaleString('en-IN') + ' · placed ' + fmt(d.paidAt || d.createdAt), 'muted'));
    if (d.status === 'cancelled' || d.status === 'refunded') {
      var a = el('p', d.status === 'refunded' ? 'This order was cancelled and refunded.' : 'This order was cancelled.', 'alert alert-info mt-16');
      out.appendChild(a);
    } else {
      var ol = el('ol', null, 'timeline mt-16');
      var rank = RANK[d.status] != null ? RANK[d.status] : 0;
      var times = { paid: d.paidAt, packed: null, shipped: d.shippedAt, delivered: d.deliveredAt };
      STEPS.forEach(function (s, i) {
        var li = el('li', null, (i <= rank ? 'done' : '') + (i === rank ? ' current' : ''));
        li.appendChild(el('span', null, 'dot'));
        var t = el('div'); t.appendChild(el('b', s[1])); t.appendChild(el('small', i <= rank ? (fmt(times[s[0]]) || s[2]) : s[2]));
        li.appendChild(t); ol.appendChild(li);
      });
      out.appendChild(ol);
    }
    if (d.trackingUrl) {
      var p = el('p', null, 'mt-8');
      var link = el('a', 'Track with ' + (d.courier || 'the courier'), 'btn btn-dark');
      link.href = d.trackingUrl; link.target = '_blank'; link.rel = 'noopener';
      p.appendChild(link); out.appendChild(p);
    }
    out.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.textContent = ''; out.hidden = true;
    var order = form.elements.order.value.trim().toUpperCase();
    var phone = form.elements.phone.value.trim();
    if (!order || !/^[6-9]\d{9}$/.test(phone)) { err.textContent = 'Enter your order number and 10-digit mobile number.'; return; }
    var btn = form.querySelector('button'); btn.disabled = true;
    fetch('/api/track?order=' + encodeURIComponent(order) + '&phone=' + encodeURIComponent(phone))
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) { if (r.ok) show(r.j); else err.textContent = r.j.error || 'Order not found.'; })
      .catch(function () { err.textContent = 'Could not check right now. Please try again.'; })
      .finally(function () { btn.disabled = false; });
  });
  if (o && form.elements.phone.value) form.requestSubmit();
})();
