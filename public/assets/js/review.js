/* Review form */
(function () {
  'use strict';
  var form = document.getElementById('review-form');
  if (!form) return;
  var err = document.getElementById('r-err');
  var q = new URLSearchParams(location.search);
  if (q.get('o')) form.elements.order.value = q.get('o').toUpperCase().slice(0, 20);
  form.elements.phone.addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 10); });
  function val(name) { var el = form.querySelector('input[name="' + name + '"]:checked'); return el ? Number(el.value) : null; }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.textContent = '';
    var f = form.elements;
    var problems = [];
    if (!val('overall')) problems.push('Choose an overall rating.');
    if (!f.name.value.trim()) problems.push('Add your name.');
    if (!f.consent.checked) problems.push('Tick the box so we can show your review.');
    if (problems.length) { err.textContent = problems.join(' '); return; }
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Sending…';
    fetch('/api/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overall: val('overall'), taste: val('taste'), crunch: val('crunch'), text: f.text.value, name: f.name.value, city: f.city.value,
        order: f.order.value, phone: f.phone.value, consent: f.consent.checked, company: f.company.value })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.j.error || 'Could not send your review.');
        form.hidden = true; document.getElementById('r-thanks').hidden = false; window.scrollTo(0, 0);
      })
      .catch(function (e2) { err.textContent = e2.message || 'Could not send your review. Please try again.'; btn.disabled = false; btn.textContent = 'Send review'; });
  });
})();
