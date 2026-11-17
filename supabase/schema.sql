-- ProBisCo store database. Run once in Supabase: SQL Editor > New query > paste > Run.
-- Amounts are whole rupees.

create extension if not exists pgcrypto;

create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text not null unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- pending (awaiting payment) > paid > packed > shipped > delivered; or cancelled / refunded
  status              text not null default 'pending'
                      check (status in ('pending','paid','packed','shipped','delivered','cancelled','refunded')),

  sku                 text not null default 'PB-CHOC-185',
  quantity            int  not null check (quantity between 1 and 100),
  unit_price          int  not null,
  subtotal            int  not null,
  delivery_fee        int  not null default 0,
  total               int  not null,

  customer_name       text not null,
  phone               text not null,
  email               text not null,
  address_line1       text not null,
  address_line2       text,
  city                text not null,
  state               text not null,
  pincode             text not null,
  notes               text,
  marketing_opt_in    boolean not null default false,

  razorpay_order_id   text unique,
  razorpay_payment_id text,
  paid_at             timestamptz,
  paid_via            text,          -- 'checkout' or 'webhook'
  alert_sent          boolean not null default false,

  courier             text,
  tracking_url        text,
  awb                 text,
  shipped_at          timestamptz,
  delivered_at        timestamptz,
  internal_notes      text
);

create index if not exists orders_status_idx  on public.orders (status, created_at desc);
create index if not exists orders_phone_idx   on public.orders (phone);
create index if not exists orders_created_idx on public.orders (created_at desc);

create table if not exists public.newsletter (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text,
  created_at timestamptz not null default now()
);

-- Keep updated_at fresh, and stamp shipped/delivered times when you change the status.
create or replace function public.orders_touch() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status = 'shipped'   and old.status is distinct from 'shipped'   and new.shipped_at   is null then new.shipped_at   := now(); end if;
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.delivered_at is null then new.delivered_at := now(); end if;
  return new;
end $$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
for each row execute function public.orders_touch();

-- Lock the tables: no public access at all. Only the website's server code
-- (service role key) and logged-in staff in the Supabase dashboard can read them.
alter table public.orders     enable row level security;
alter table public.newsletter enable row level security;
revoke all on public.orders, public.newsletter from anon, authenticated;

-- Handy views for the dashboard / CRM.
create or replace view public.orders_to_ship with (security_invoker = true) as
  select order_number, paid_at, quantity, total, customer_name, phone,
         address_line1, address_line2, city, state, pincode, notes
  from public.orders where status = 'paid' order by paid_at;

create or replace view public.daily_sales with (security_invoker = true) as
  select (paid_at at time zone 'Asia/Kolkata')::date as day,
         count(*) as orders, sum(quantity) as jars, sum(total) as revenue
  from public.orders where status in ('paid','packed','shipped','delivered')
  group by 1 order by 1 desc;

revoke all on public.orders_to_ship, public.daily_sales from anon, authenticated;

-- ============================================================
-- Creator codes, sales tracking and Shiprocket (added Nov 2026)
-- ============================================================
create table if not exists public.coupons (
  code             text primary key check (code ~ '^[A-Z0-9_-]{3,24}$'),
  owner_name       text not null,              -- influencer or campaign name
  owner_contact    text,
  discount_per_jar int  not null default 20 check (discount_per_jar between 0 and 200),
  active           boolean not null default true,
  expires_at       timestamptz,
  notes            text,
  created_at       timestamptz not null default now()
);

alter table public.orders
  add column if not exists coupon_code    text references public.coupons(code) on update cascade,
  add column if not exists discount       int  not null default 0,
  add column if not exists utm_source     text,
  add column if not exists utm_medium     text,
  add column if not exists utm_campaign   text,
  add column if not exists shiprocket_order_id    text,
  add column if not exists shiprocket_shipment_id text,
  add column if not exists shiprocket_error       text,
  add column if not exists courier_status text;

create index if not exists orders_coupon_idx on public.orders (coupon_code);
create index if not exists orders_awb_idx on public.orders (awb);

create table if not exists public.courier_events (
  id          bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  order_number text,
  awb         text,
  status      text,
  payload     jsonb
);

create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.coupons        enable row level security;
alter table public.courier_events enable row level security;
alter table public.app_settings   enable row level security;
revoke all on public.coupons, public.courier_events, public.app_settings from anon, authenticated;

create or replace view public.coupon_sales with (security_invoker = true) as
  select c.code, c.owner_name, c.active,
         count(o.id)                       as orders,
         coalesce(sum(o.quantity), 0)      as jars,
         coalesce(sum(o.total), 0)         as revenue,
         coalesce(sum(o.discount), 0)      as discount_given,
         max(o.paid_at)                    as last_order_at
  from public.coupons c
  left join public.orders o
    on o.coupon_code = c.code and o.status in ('paid','packed','shipped','delivered')
  group by c.code, c.owner_name, c.active
  order by revenue desc;

create or replace view public.sales_by_source with (security_invoker = true) as
  select case when coupon_code is not null then 'coupon: ' || coupon_code
              when utm_source is not null then 'ad/link: ' || utm_source || coalesce(' / ' || utm_campaign, '')
              else 'website (direct)' end as source,
         count(*) as orders, sum(quantity) as jars, sum(total) as revenue
  from public.orders
  where status in ('paid','packed','shipped','delivered')
  group by 1 order by revenue desc;

revoke all on public.coupon_sales, public.sales_by_source from anon, authenticated;

-- ProBisCo HQ sync status (added Nov 2026)
alter table public.orders
  add column if not exists hq_synced boolean not null default false,
  add column if not exists hq_error text;
create index if not exists orders_hq_pending_idx on public.orders (paid_at) where hq_synced = false;
