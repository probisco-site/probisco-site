/* ProBisCo storefront: cart, order builder, drawer, menu, newsletter.
   Prices here are for display only. The server recalculates every order. */
(function () {
  'use strict';

  var PB = window.PB = window.PB || {};
  PB.config = { price: 219, mrp: 249, delivery: 80, freeFrom: 4, max: 24, cookiesPerJar: 6, proteinPerJar: 30 };
  var C = PB.config;
  var KEY = 'pb_cart_qty';

  function rs(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function clamp(n) { n = parseInt(n, 10) || 0; return Math.max(0, Math.min(C.max, n)); }

  PB.price = function (qty) {
    qty = clamp(qty);
    var subtotal = qty * C.price;
    var cp = PB.getCoupon();
    var perJar = cp ? Math.min(cp.perJar, C.price) : 0;
    var discount = qty * perJar;
    var delivery = qty === 0 || qty >= C.freeFrom ? 0 : C.delivery;
    return {
      qty: qty, subtotal: subtotal, discount: discount, coupon: cp ? cp.code : null, delivery: delivery,
      total: subtotal - discount + delivery,
      savings: qty * (C.mrp - C.price) + discount, cookies: qty * C.cookiesPerJar, protein: qty * C.proteinPerJar
    };
  };
  PB.rs = rs;

  // ---- Coupon codes and campaign tags ----
  // A code arrives by link (probisco.in/?code=NAME20) or is typed at checkout. It is kept
  // for 30 days on this device. The server re-checks it on every order.
  var CKEY = 'pb_coupon', UKEY = 'pb_utm', TTL = 30 * 864e5;
  function readJSON(k) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v && v.at && Date.now() - v.at < TTL ? v : null; } catch (e) { return null; } }
  function writeJSON(k, v) { try { if (v) localStorage.setItem(k, JSON.stringify(v)); else localStorage.removeItem(k); } catch (e) {} }
  PB.getCoupon = function () { var c = readJSON(CKEY); return c && c.code ? c : null; };
  PB.setCoupon = function (c) {
    writeJSON(CKEY, c ? { code: c.code, perJar: Number(c.discountPerJar) || 0, at: Date.now() } : null);
    renderCartBits();
    document.dispatchEvent(new CustomEvent('pb:cart', { detail: { qty: PB.getCart() } }));
  };
  PB.checkCoupon = function (code) {
    return fetch('/api/coupon?code=' + encodeURIComponent(code)).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'This code isn\'t valid or has expired.');
        return j;
      });
    });
  };
  PB.getUtm = function () { var u = readJSON(UKEY); return u ? { source: u.source, medium: u.medium, campaign: u.campaign } : null; };
  (function captureFromUrl() {
    var q = new URLSearchParams(location.search);
    if (q.get('utm_source')) writeJSON(UKEY, { source: q.get('utm_source').slice(0, 60), medium: (q.get('utm_medium') || '').slice(0, 60), campaign: (q.get('utm_campaign') || '').slice(0, 80), at: Date.now() });
    var code = q.get('code') || q.get('coupon');
    if (code) {
      PB.checkCoupon(code).then(function (c) { PB.setCoupon(c); PB._couponNote = c.code; showCouponNote(); }).catch(function () {});
    }
  })();
  function showCouponNote() {
    var c = PB.getCoupon(); if (!c || !document.body) return;
    var span = document.querySelector('.announce span');
    if (span) span.textContent = 'Code ' + c.code + ' applied: ' + rs(C.price - c.perJar) + ' a jar';
  }

  // ---- Cart storage (single product for now) ----
  PB.getCart = function () {
    try { return clamp(localStorage.getItem(KEY)); } catch (e) { return PB._mem || 0; }
  };
  PB.setCart = function (qty) {
    qty = clamp(qty);
    try { localStorage.setItem(KEY, String(qty)); } catch (e) { PB._mem = qty; }
    renderCartBits();
    document.dispatchEvent(new CustomEvent('pb:cart', { detail: { qty: qty } }));
    return qty;
  };
  PB.clearCart = function () { PB.setCart(0); };

  function jarWord(n) { return n === 1 ? 'jar' : 'jars'; }
  function shipHint(qty) {
    if (qty <= 0) return 'Delivery is free on ' + C.freeFrom + ' jars or more.';
    var left = C.freeFrom - qty;
    return left > 0 ? 'Add ' + left + ' more ' + jarWord(left) + ' for free delivery.' : 'Free delivery unlocked.';
  }

  var ICON = {
    minus: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    plus: '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>',
    close: '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    arrow: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  // ---- Header cart count ----
  function renderCartBits() {
    var q = PB.getCart();
    document.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = q; });
    document.querySelectorAll('[data-cart-label]').forEach(function (el) {
      el.setAttribute('aria-label', 'Open cart, ' + q + ' ' + jarWord(q));
    });
    renderDrawer();
  }

  // ---- Drawer ----
  var drawer, backdrop, lastFocus;
  function buildDrawer() {
    backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    backdrop.addEventListener('click', closeDrawer);
    drawer = document.createElement('aside');
    drawer.className = 'drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'drawer-title');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    drawer.innerHTML =
      '<div class="drawer-head"><h2 id="drawer-title">Your cart</h2>' +
      '<button class="icon-btn" type="button" data-drawer-close aria-label="Close cart">' + ICON.close + '</button></div>' +
      '<div class="drawer-body" data-drawer-body></div>' +
      '<div class="drawer-foot" data-drawer-foot></div>';
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);
    drawer.querySelector('[data-drawer-close]').addEventListener('click', closeDrawer);
    drawer.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cart-step]');
      if (b) PB.setCart(PB.getCart() + parseInt(b.getAttribute('data-cart-step'), 10));
      if (e.target.closest('[data-cart-remove]')) PB.setCart(0);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) closeDrawer();
    });
    renderDrawer();
  }
  function renderDrawer() {
    if (!drawer) return;
    var p = PB.price(PB.getCart());
    var body = drawer.querySelector('[data-drawer-body]');
    var foot = drawer.querySelector('[data-drawer-foot]');
    if (p.qty === 0) {
      body.innerHTML = '<div class="empty-cart"><p>Your cart is empty.</p><a class="btn btn-dark" href="/chocolate-chip-protein-cookies/">Shop the jar ' + ICON.arrow + '</a></div>';
      foot.innerHTML = '';
      return;
    }
    body.innerHTML =
      '<div class="cart-line"><img src="/assets/img/jar-thumb-v2.webp" alt="" width="76" height="76">' +
      '<div style="flex:1 1 auto;min-width:0"><b>Chocolate chip protein cookies</b><div class="muted" style="font-size:13px">6 cookies · 30g protein per jar · ' + rs(C.price) + ' each</div>' +
      '<button type="button" data-cart-remove style="background:none;border:0;padding:6px 0;color:#8A4A1F;font-weight:600;cursor:pointer;font-size:13px">Remove</button></div></div>' +
      '<div class="stepper" style="justify-content:center">' +
      '<button type="button" class="step-btn" data-cart-step="-1" aria-label="Remove one jar"' + (p.qty <= 1 ? ' disabled' : '') + '>' + ICON.minus + '</button>' +
      '<div class="step-val" aria-live="polite"><span class="n">' + p.qty + '</span><span class="u">' + jarWord(p.qty) + '</span></div>' +
      '<button type="button" class="step-btn plus" data-cart-step="1" aria-label="Add one jar"' + (p.qty >= C.max ? ' disabled' : '') + '>' + ICON.plus + '</button></div>' +
      '<div><div class="ship-hint">' + shipHint(p.qty) + '</div><div class="ship-bar" aria-hidden="true"><span style="width:' + Math.min(100, p.qty / C.freeFrom * 100) + '%"></span></div></div>';
    foot.innerHTML =
      '<div class="sum-rows"><div><span>' + p.qty + ' × ' + rs(C.price) + '</span><span>' + rs(p.subtotal) + '</span></div>' +
      (p.discount ? '<div><span>Code ' + p.coupon + '</span><span style="color:#8A4A1F;font-weight:700">−' + rs(p.discount) + '</span></div>' : '') +
      '<div><span>Delivery</span><span>' + (p.delivery ? rs(p.delivery) : '<b style="color:#8A4A1F">Free</b>') + '</span></div>' +
      '<div class="total"><span>Total</span><span>' + rs(p.total) + '</span></div></div>' +
      '<a class="btn btn-dark btn-block" href="/checkout/">Checkout ' + ICON.arrow + '</a>' +
      '<div class="muted center" style="font-size:12px">UPI, cards and netbanking via Razorpay</div>';
  }
  function openDrawer() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    document.body.classList.add('drawer-open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.inert = false;
    setTimeout(function () { drawer.querySelector('[data-drawer-close]').focus(); }, 50);
  }
  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  PB.openDrawer = openDrawer;

  // ---- Order builder (homepage + product page) ----
  function initBuilder(root) {
    var qty = clamp(root.getAttribute('data-default') || 1) || 1;
    function q(sel) { return root.querySelectorAll(sel); }
    function set(field, val) { q('[data-sum="' + field + '"]').forEach(function (el) { el.textContent = val; }); }
    function render() {
      var p = PB.price(qty);
      q('[data-qty-n]').forEach(function (el) { el.textContent = qty; });
      q('[data-qty-u]').forEach(function (el) { el.textContent = jarWord(qty); });
      q('[data-dec]').forEach(function (b) { b.disabled = qty <= 1; });
      q('[data-inc]').forEach(function (b) { b.disabled = qty >= C.max; });
      q('.pick').forEach(function (b) {
        var n = parseInt(b.getAttribute('data-pick'), 10), pp = PB.price(n), sm = b.querySelector('small');
        b.setAttribute('aria-pressed', String(n === qty));
        if (sm) sm.textContent = rs(pp.subtotal - pp.discount) + (pp.delivery ? ' + ' + rs(pp.delivery) + ' delivery' : ' · free delivery');
      });
      q('[data-hint]').forEach(function (el) { el.textContent = shipHint(qty); });
      q('[data-bar]').forEach(function (el) { el.style.width = Math.min(100, qty / C.freeFrom * 100) + '%'; });
      set('cookies', p.cookies); set('protein', p.protein); set('qtyline', qty + ' × ' + rs(C.price));
      set('subtotal', rs(p.subtotal)); set('savings', rs(p.savings)); set('total', rs(p.total));
      q('[data-sum="delivery"]').forEach(function (el) {
        el.textContent = p.delivery ? rs(p.delivery) : 'Free';
        el.classList.toggle('free', !p.delivery);
      });
      document.querySelectorAll('[data-sticky-qty]').forEach(function (el) { el.textContent = qty + ' ' + jarWord(qty); });
      document.querySelectorAll('[data-sticky-total]').forEach(function (el) { el.textContent = rs(p.total); });
      document.querySelectorAll('[data-sticky-note]').forEach(function (el) { el.textContent = p.delivery ? 'incl. ' + rs(p.delivery) + ' delivery' : 'free delivery'; });
    }
    document.addEventListener('pb:cart', render); // e.g. a coupon code was applied
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-dec]')) { qty = Math.max(1, qty - 1); render(); }
      else if (e.target.closest('[data-inc]')) { qty = Math.min(C.max, qty + 1); render(); }
      else if (e.target.closest('.pick')) { qty = clamp(e.target.closest('.pick').getAttribute('data-pick')); render(); }
      else if (e.target.closest('[data-add]')) { addToCart(qty); }
      else if (e.target.closest('[data-buy-now]')) { PB.setCart(qty); location.href = '/checkout/'; }
    });
    document.querySelectorAll('[data-sticky-add]').forEach(function (b) {
      b.addEventListener('click', function () { addToCart(qty); });
    });
    render();
  }
  // ---- Delivery check by pincode ----
  function initPinCheck(form) {
    var input = form.querySelector('input'), msg = form.querySelector('[data-pin-msg]'), btn = form.querySelector('button');
    try { var saved = localStorage.getItem('pb_pin'); if (saved) input.value = saved; } catch (e) {}
    input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = input.value.trim();
      msg.className = 'pin-msg';
      if (!/^[1-9]\d{5}$/.test(pin)) { msg.textContent = 'Enter a valid 6-digit pincode.'; msg.classList.add('no'); return; }
      btn.disabled = true; msg.textContent = 'Checking…';
      fetch('/api/delivery-check?pincode=' + pin)
        .then(function (r) { return r.json(); })
        .then(function (j) {
          msg.textContent = j.message || j.error || 'We deliver across India.';
          if (j.available === true) msg.classList.add('ok'); else if (j.available === false || j.error) msg.classList.add('no');
          try { if (j.available !== false && !j.error) localStorage.setItem('pb_pin', pin); } catch (e) {}
        })
        .catch(function () { msg.textContent = 'Couldn\'t check right now. We deliver across India.'; })
        .finally(function () { btn.disabled = false; });
    });
  }

  // ---- Approved customer reviews (homepage) ----
  function initReviews(box) {
    fetch('/api/reviews').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.count) return;
      var grid = box.querySelector('[data-reviews-grid]');
      var stars = function (n) { return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n); };
      j.reviews.slice(0, 6).forEach(function (r) {
        var c = document.createElement('figure'); c.className = 'review-card';
        var st = document.createElement('div'); st.className = 'st'; st.textContent = stars(r.rating); st.setAttribute('aria-label', r.rating + ' out of 5');
        c.appendChild(st);
        if (r.text) { var p = document.createElement('p'); p.textContent = '“' + r.text + '”'; c.appendChild(p); }
        var who = document.createElement('figcaption'); who.className = 'who';
        var av = document.createElement('span'); av.className = 'av'; av.setAttribute('aria-hidden', 'true'); av.textContent = (r.name || '?').charAt(0).toUpperCase();
        var nm = document.createElement('span'); nm.textContent = r.name + (r.city ? ', ' + r.city : '');
        who.appendChild(av); who.appendChild(nm);
        c.appendChild(who);
        if (r.verified || r.inPerson) { var t = document.createElement('span'); t.className = 'tag'; t.textContent = r.verified ? 'Verified buyer' : 'Tried it at our stall'; c.appendChild(t); }
        grid.appendChild(c);
      });
      if (j.count >= 3) box.querySelector('[data-reviews-avg]').innerHTML = '<b>' + j.average.toFixed(1) + '</b><span>out of 5 from ' + j.count + ' reviews</span>';
      var title = document.querySelector('[data-reviews-title]'); if (title) title.textContent = 'What people say about the crunch.';
      var lead = document.querySelector('[data-reviews-lead]'); if (lead) lead.textContent = 'Tried it too? Add your review.';
      box.hidden = false;
    }).catch(function () {});
  }

  function addToCart(n) {
    var before = PB.getCart();
    PB.setCart(Math.min(C.max, before + n));
    if (window.gtag) { try { window.gtag('event', 'add_to_cart', { currency: 'INR', value: n * C.price }); } catch (e) {} }
    if (window.fbq) { try { window.fbq('track', 'AddToCart', { currency: 'INR', value: n * C.price }); } catch (e) {} }
    openDrawer();
  }
  PB.addToCart = addToCart;

  // ---- Sticky mobile bar ----
  function initSticky() {
    var bar = document.querySelector('.sticky-bar');
    if (!bar) return;
    document.body.classList.add('has-sticky');
    var onScroll = function () { bar.classList.toggle('show', window.scrollY > 520); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---- Mobile menu ----
  function initMenu() {
    var btn = document.querySelector('[data-menu]');
    var nav = document.getElementById('mobile-nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
  }

  // ---- Newsletter ----
  function initNewsletter() {
    document.querySelectorAll('form[data-newsletter]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = form.querySelector('input[type=email]');
        var msg = form.querySelector('.form-msg');
        var btn = form.querySelector('button');
        var email = (input.value || '').trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { msg.textContent = 'Please enter a valid email.'; input.focus(); return; }
        btn.disabled = true; msg.textContent = 'Subscribing…';
        fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            msg.textContent = res.ok ? 'You\'re in. Watch your inbox for launch offers.' : (res.j.error || 'Could not subscribe. Please try again.');
            if (res.ok) form.reset();
          })
          .catch(function () { msg.textContent = 'Could not subscribe. Please try again.'; })
          .finally(function () { btn.disabled = false; });
      });
    });
  }

  // ---- Product gallery ----
  function initGallery() {
    var main = document.querySelector('[data-gallery-main]');
    if (!main) return;
    document.querySelectorAll('[data-gallery-thumb]').forEach(function (b) {
      b.addEventListener('click', function () {
        main.src = b.getAttribute('data-src');
        main.alt = b.getAttribute('data-alt');
        document.querySelectorAll('[data-gallery-thumb]').forEach(function (x) { x.setAttribute('aria-current', String(x === b)); });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    showCouponNote();
    document.querySelectorAll('[data-pin-check]').forEach(initPinCheck);
    document.querySelectorAll('[data-reviews]').forEach(initReviews);
    var rsum = document.querySelector('[data-rating-sum]');
    if (rsum) fetch('/api/reviews').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.count < 3) return;
      rsum.innerHTML = '<span class="st" aria-hidden="true">' + '★★★★★'.slice(0, Math.round(j.average)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(j.average)) + '</span><span>' + j.average.toFixed(1) + ' out of 5 · ' + j.count + ' reviews</span>';
      rsum.hidden = false;
    }).catch(function () {});
    buildDrawer();
    renderCartBits();
    document.querySelectorAll('[data-open-cart]').forEach(function (b) { b.addEventListener('click', openDrawer); });
    document.querySelectorAll('[data-builder]').forEach(initBuilder);
    initSticky(); initMenu(); initNewsletter(); initGallery();
    var y = document.querySelector('[data-year]'); if (y) y.textContent = new Date().getFullYear();
  });
  window.addEventListener('storage', function (e) { if (e.key === KEY) renderCartBits(); });
})();
