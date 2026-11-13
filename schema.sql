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
create or replace function public.orders_touch() returns trigger language plpgsql as $$
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
