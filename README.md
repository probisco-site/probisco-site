# ProBisCo website: setup and go-live guide

This folder is the complete ProBisCo store for **probisco.in**:

- **Storefront** (`public/`): homepage, product page, cart, checkout, order confirmation, order tracking, lab report, contact and policy pages. Plain HTML, CSS and JavaScript, with SEO tags, Google product data, sitemap and robots.txt.
- **Backend** (`functions/api/` and `lib/`): small server functions that run on Cloudflare. They price the order (the browser can't change the price), take payment through Razorpay, save the order in Supabase, and send you an alert.
- **Database** (`supabase/schema.sql`): the order and newsletter tables.

Prices live in two places. Change both if prices change:
`lib/shop.js` (what customers are charged) and `public/assets/js/main.js` (what the site displays).
Today: ₹180 a jar (MRP ₹249), ₹80 delivery on 1 to 3 jars, free from 4 jars, maximum 24 jars per order.

---

## Before you start: fill in these placeholders

Search all files for these and replace them:

| Placeholder | Where | Replace with |
|---|---|---|
| `[GRIEVANCE OFFICER NAME]` | Contact, privacy policy | Name of the person handling complaints (legally required) |
| `[GSTIN]` | Contact, terms | Eykam Wellness GST number |
| `hello@probisco.in` | Every page | The professional email you create |
| `probisco.in` | Every page, sitemap, robots.txt | Only if your domain ends up different |

Also check:
- **Ingredients:** the website leaves out fat spread and vanilla extract, as you asked. Your printed label still lists both. The site and the label must match (FSSAI), so either update the label or add them back in `public/index.html` and `public/chocolate-chip-protein-cookies/index.html`.
- **Lab report PDF:** the Equinox report says it "shall not be reproduced except in full and with written approval of Equinox Labs". Get their written OK by email before launch, or remove the PDF link.
- **Support hours** on the contact page say Monday to Saturday, 10 AM to 6 PM.

---

## Step 1. Create the database (Supabase, about 10 minutes)

1. Go to supabase.com, open your account and click **New project**. Name it `probisco`, region **Mumbai (ap-south-1)**, and save the database password somewhere safe.
2. Open **SQL Editor > New query**, paste everything from `supabase/schema.sql`, and click **Run**.
3. Open **Project Settings > API** and copy:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role** key (click Reveal) → this is `SUPABASE_SERVICE_ROLE_KEY`. Keep it secret. Never put it in website files.

**Where orders appear:** Supabase > **Table Editor > orders**. Each order is a row with the customer, address, jars, amount, Razorpay payment ID and status. The `orders_to_ship` view lists paid orders waiting to be packed. `daily_sales` totals orders, jars and revenue per day. Your CRM app can read the same tables with the same keys.

Free Supabase projects pause after about a week of very little activity. Your data is safe and you can restore it from the dashboard. Regular orders and visits keep it awake. Move to the Pro plan once orders are steady.

## Step 2. Set up email alerts (Resend, about 15 minutes, optional but recommended)

1. Sign up at resend.com and add your domain `probisco.in` (**Domains > Add domain**). Resend shows a few DNS records. Add them in Cloudflare DNS after Step 4, then click Verify.
2. Create an API key → this is `RESEND_API_KEY`.

Every paid order then sends:
- you an alert with the address and phone number, to `ORDER_ALERT_EMAIL`; and
- the customer a confirmation email from `EMAIL_FROM`.

**Optional instant phone alert (free, Telegram):** in Telegram, message `@BotFather` and send `/newbot` to get a token (`TELEGRAM_BOT_TOKEN`). Send any message to your new bot, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser. The number after `"chat":{"id":` is your `TELEGRAM_CHAT_ID`.

Razorpay also emails you on every successful payment.

## Step 3. Put the site on Cloudflare Pages (about 15 minutes)

Easiest route, via GitHub:
1. Create a private GitHub repository, for example `probisco-site`, and upload this whole folder. Don't upload a `.dev.vars` file.
2. In Cloudflare, open **Workers & Pages > Create application**, click **Looking to deploy Pages? Get started** at the bottom, then **Import an existing Git repository**, and pick the repository. (Don't create a Worker: it won't build this site.)
3. Build settings: Framework preset **None**, Build command **(leave empty)**, Build output directory **`public`**. Click **Save and Deploy**.
4. Open **Settings > Variables and Secrets** and add each value from `.dev.vars.example` as a **Secret**, for Production. Start with the Razorpay **test** keys. Then click **Deployments > Retry deployment** so they take effect.

Your site is now live at `probisco.pages.dev`. Every change you push to GitHub redeploys automatically.

(Without GitHub: install Node.js, then run `npx wrangler pages deploy public --project-name probisco-site` inside this folder.)

## Step 4. Connect probisco.in

1. Buy the domain. If it's not bought at Cloudflare, add it to Cloudflare (**Add a site**, Free plan) and change the nameservers at your registrar to the two Cloudflare gives you. This takes from a few minutes to a few hours.
2. In your Pages project, open **Custom domains > Set up a domain** and add `probisco.in`, then add `www.probisco.in` too. HTTPS is set up automatically.
3. Set up your professional email. With Zoho Mail or Google Workspace, add their MX and TXT records in Cloudflare DNS. Cloudflare's free **Email Routing** can also forward `hello@probisco.in` to your Gmail.

## Step 5. Payments (Razorpay)

1. In the Eykam Razorpay dashboard, add the new website (**Account & Settings > Business website details**, or ask Razorpay support to whitelist `probisco.in`). Razorpay checks that the site shows the policy pages, contact details and prices. They're all there.
2. Make sure **payment capture is automatic** (**Account & Settings > Payment capture**).
3. Create a webhook: **Account & Settings > Webhooks > Add new webhook**.
   - URL: `https://probisco.in/api/razorpay-webhook`
   - Secret: any long random text (the same value goes in `RAZORPAY_WEBHOOK_SECRET`)
   - Events: tick **payment.captured** and **order.paid**

   The webhook confirms orders even if a customer closes the browser right after paying.
4. Do this in **Test mode** first, then repeat it in **Live mode** with the live keys.

## Step 6. Test, then go live

1. With test keys, place an order on the live site. Use Razorpay's test UPI ID `success@razorpay`, or a test card from Razorpay's docs.
2. Check that:
   - you land on "Order confirmed";
   - the order shows in Supabase as `paid`;
   - the alert email or Telegram message arrives; and
   - "Track my order" finds it.
3. Swap the three Razorpay values for **live** keys in Cloudflare, then redeploy.
4. Place one real order yourself, ship it, then refund it from Razorpay.

## Daily operations: shipping an order

1. Open **orders_to_ship** in Supabase, or your CRM. Book the shipment in Shiprocket with the address and phone number.
2. In the `orders` table, set `status` to `packed`, then to `shipped`. Fill in `courier` and `tracking_url` (the Shiprocket tracking link). The shipped date is stamped automatically.
3. When it's delivered, set `status` to `delivered`.

Customers see these updates on the **Track my order** page. For cancellations, refund in Razorpay first, then set the status to `refunded`.

Unpaid orders (abandoned at payment) stay with status `pending`. They're useful for following up, and they're never shown to customers.

## Step 7. SEO and analytics after launch

1. **Google Search Console:** add `probisco.in` (domain property, verified through a DNS TXT record in Cloudflare), then submit `https://probisco.in/sitemap.xml`.
2. **Google Merchant Center:** create a free account, verify the site, and add the product. The product page already carries price, stock, shipping and return information for Google.
3. **Google Business Profile:** add the website link.
4. **Analytics:** for Google Analytics 4 or a Meta Pixel, paste their snippet before `</head>` in each page. The site already reports add-to-cart, checkout and purchase events to both if they're present. Mention cookies in the privacy policy when you add them.
5. Link the site from your Instagram bio, and print a QR code to `probisco.in` for stalls.
6. Replace the AI renders with real product photos when you have them (same file names in `public/assets/img/`, WebP, under 200 KB each if possible). Add real customer reviews to the homepage once you have them, never invented ones.

## Running it on your computer (optional)

```
npm install -g wrangler
cp .dev.vars.example .dev.vars   # fill in test values
wrangler pages dev public --compatibility-date=2024-11-01
```

Then open http://localhost:8788.

## Files

```
public/                    website files (what visitors see)
  index.html               homepage
  chocolate-chip-protein-cookies/  product page
  checkout/  order-confirmed/  track-order/
  lab-report/  contact/  shipping-policy/  refund-policy/  privacy-policy/  terms/
  assets/css/styles.css    all styling
  assets/js/main.js        cart, drawer, jar counter, newsletter
  assets/js/checkout.js    checkout and Razorpay
  assets/js/track.js       order tracking
  assets/img/              images, logos, icons
  sitemap.xml  robots.txt  _headers  404.html
functions/api/             server endpoints (Cloudflare Pages Functions)
  create-order.js          prices the order, saves it, creates the Razorpay order
  verify-payment.js        confirms payment after checkout
  razorpay-webhook.js      confirms payment from Razorpay directly
  track.js                 order status lookup
  subscribe.js             newsletter sign-ups
lib/                       shared server code (prices, Razorpay, Supabase, alerts)
supabase/schema.sql        database setup
```
