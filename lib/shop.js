// Single source of truth for prices on the server. Amounts in rupees unless named *Paise.
export const PRODUCT = {
  sku: 'PB-CHOC-185',
  name: 'ProBisCo Chocolate Chip Protein Cookies (6 cookies, 185g)',
  price: 219,
  mrp: 249,
};
export const DELIVERY_FEE = 80;
export const FREE_DELIVERY_FROM = 4;
export const MAX_QTY = 24;

// coupon: { code, discount_per_jar } or null. Delivery rules don't change with a coupon.
export function priceOrder(qty, coupon = null) {
  const subtotal = qty * PRODUCT.price;
  const perJar = coupon ? Math.min(Number(coupon.discount_per_jar) || 0, PRODUCT.price) : 0;
  const discount = qty * perJar;
  const delivery = qty >= FREE_DELIVERY_FROM ? 0 : DELIVERY_FEE;
  return { qty, unitPrice: PRODUCT.price, subtotal, discount, perJarDiscount: perJar, delivery, total: subtotal - discount + delivery, couponCode: coupon ? coupon.code : null };
}

export function normalizeCode(v) {
  const c = String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return /^[A-Z0-9_-]{3,24}$/.test(c) ? c : null;
}

const STATES = new Set(['Andaman and Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand','Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal']);

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Returns { data } or { errors: [...] }
export function validateCheckout(body) {
  const errors = [];
  const qty = Number.parseInt(body?.qty, 10);
  const d = {
    qty,
    name: clean(body?.name, 80),
    phone: clean(body?.phone, 10).replace(/\D/g, ''),
    email: clean(body?.email, 120).toLowerCase(),
    address1: clean(body?.address1, 160),
    address2: clean(body?.address2, 160),
    city: clean(body?.city, 60),
    state: clean(body?.state, 60),
    pincode: clean(body?.pincode, 6),
    notes: clean(body?.notes, 300),
    marketing: body?.marketing === true,
    coupon: body?.coupon ? normalizeCode(body.coupon) : null,
    couponGiven: Boolean(body?.coupon),
    utmSource: clean(body?.utm?.source, 60) || null,
    utmMedium: clean(body?.utm?.medium, 60) || null,
    utmCampaign: clean(body?.utm?.campaign, 80) || null,
  };
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) errors.push(`Choose between 1 and ${MAX_QTY} jars. For bigger orders, message us on WhatsApp.`);
  if (d.name.length < 2) errors.push('Enter your full name.');
  if (!/^[6-9]\d{9}$/.test(d.phone)) errors.push('Enter a valid 10-digit Indian mobile number.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) errors.push('Enter a valid email address.');
  if (d.address1.length < 5) errors.push('Enter your house, building and street.');
  if (!/^[1-9]\d{5}$/.test(d.pincode)) errors.push('Enter a valid 6-digit pincode.');
  if (d.city.length < 2) errors.push('Enter your city.');
  if (!STATES.has(d.state)) errors.push('Select your state.');
  return errors.length ? { errors } : { data: d };
}

export function newOrderNumber(now = new Date()) {
  // PB + YYMMDD (IST) + '-' + 4 random digits, e.g. PB261113-4821
  const ist = new Date(now.getTime() + 330 * 60000);
  const ymd = ist.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = crypto.getRandomValues(new Uint16Array(1))[0] % 10000;
  return `PB${ymd}-${String(rand).padStart(4, '0')}`;
}
