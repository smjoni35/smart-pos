-- =====================================================================
-- Universal POS (Multi-tenant) — Supabase / PostgreSQL schema
-- Run once in: Supabase Dashboard > SQL Editor
-- =====================================================================

-- ---------- 1. Types ----------
create type user_role     as enum ('super_admin', 'owner', 'manager', 'cashier');
create type shop_status   as enum ('pending', 'active', 'suspended');
create type pay_method    as enum ('cash', 'card', 'mobile', 'due');
create type adjust_reason as enum ('damaged', 'expired', 'lost', 'correction');

-- ---------- 2. Core tables ----------
create table shops (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  business_type        text not null default 'general',   -- grocery, supershop, library ...
  phone                text,
  address              text,
  currency             text not null default 'BDT',
  allow_negative_stock boolean not null default false,
  status               shop_status not null default 'active', -- use 'pending' for manual approval
  trial_ends_at        timestamptz default (now() + interval '30 days'),
  created_at           timestamptz not null default now()
);

-- per-shop invoice counter (no policies: only RPC functions touch it)
create table shop_counters (
  shop_id     uuid primary key references shops(id) on delete cascade,
  invoice_seq bigint not null default 0
);

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  shop_id    uuid references shops(id) on delete cascade,   -- null for super_admin
  full_name  text not null,
  role       user_role not null default 'cashier',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table categories (
  id      uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name    text not null,
  unique (shop_id, name)
);

create table products (
  id              uuid primary key default gen_random_uuid(),
  shop_id         uuid not null references shops(id) on delete cascade,
  category_id     uuid references categories(id) on delete set null,
  name            text not null,
  sku             text,
  barcode         text,
  unit            text not null default 'pcs',              -- pcs, kg, litre, dozen ...
  buy_price       numeric(14,2) not null default 0 check (buy_price >= 0),
  sell_price      numeric(14,2) not null default 0 check (sell_price >= 0),
  stock_qty       numeric(14,3) not null default 0,
  low_stock_alert numeric(14,3) not null default 5,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (shop_id, barcode)
);

create table customers (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  name        text not null,
  phone       text,
  address     text,
  due_balance numeric(14,2) not null default 0,             -- customer owes the shop
  created_at  timestamptz not null default now()
);

create table suppliers (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  name        text not null,
  phone       text,
  due_balance numeric(14,2) not null default 0,             -- shop owes the supplier
  created_at  timestamptz not null default now()
);

create table sales (
  id             uuid primary key default gen_random_uuid(),
  shop_id        uuid not null references shops(id) on delete cascade,
  invoice_no     text not null,
  customer_id    uuid references customers(id) on delete set null,
  cashier_id     uuid references profiles(id) on delete set null,
  subtotal       numeric(14,2) not null default 0,
  discount       numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  paid           numeric(14,2) not null default 0,
  due            numeric(14,2) not null default 0,
  payment_method pay_method not null default 'cash',
  total_cost     numeric(14,2) not null default 0,
  profit         numeric(14,2) not null default 0,
  created_at     timestamptz not null default now(),
  unique (shop_id, invoice_no)
);

create table sale_items (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references sales(id) on delete cascade,
  shop_id      uuid not null references shops(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  product_name text not null,
  qty          numeric(14,3) not null check (qty > 0),
  unit_price   numeric(14,2) not null,
  unit_cost    numeric(14,2) not null,
  line_total   numeric(14,2) not null
);

create table purchases (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete set null,
  total       numeric(14,2) not null default 0,
  paid        numeric(14,2) not null default 0,
  due         numeric(14,2) not null default 0,
  note        text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table purchase_items (
  id          uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  shop_id     uuid not null references shops(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  qty         numeric(14,3) not null check (qty > 0),
  unit_cost   numeric(14,2) not null check (unit_cost >= 0)
);

create table due_payments (                                  -- customer pays back baki
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  method      pay_method not null default 'cash',
  note        text,
  received_by uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table expenses (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops(id) on delete cascade,
  title        text not null,
  category     text,                                         -- rent, salary, electricity ...
  amount       numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table stock_adjustments (                             -- damaged / expired = loss
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  qty_change  numeric(14,3) not null,
  reason      adjust_reason not null,
  loss_amount numeric(14,2) not null default 0,
  note        text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- 3. Indexes ----------
create index on products (shop_id, name);
create index on sales (shop_id, created_at desc);
create index on sale_items (sale_id);
create index on customers (shop_id, name);
create index on expenses (shop_id, expense_date);
create index on stock_adjustments (shop_id, created_at desc);
create index on profiles (shop_id);

-- ---------- 4. Helper functions (used by RLS) ----------
create function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from profiles
                   where id = auth.uid() and is_active), false)
$$;

create function current_role_name() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create function my_shop_id() returns uuid
language sql stable security definer set search_path = public as $$
  select shop_id from profiles where id = auth.uid() and is_active
$$;

-- shop of the logged-in user, only if that shop is active
create function current_shop_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.shop_id from profiles p
  join shops s on s.id = p.shop_id
  where p.id = auth.uid() and p.is_active and s.status = 'active'
$$;

-- owners cannot change their own shop's status / trial
create function protect_shop_columns() returns trigger
language plpgsql as $$
begin
  if not is_super_admin() then
    new.status        := old.status;
    new.trial_ends_at := old.trial_ends_at;
  end if;
  return new;
end $$;

create trigger trg_protect_shop_columns
before update on shops
for each row execute function protect_shop_columns();

-- ---------- 5. Row Level Security ----------
alter table shops          enable row level security;
alter table shop_counters  enable row level security;   -- no policies = closed
alter table profiles       enable row level security;

create policy shops_select on shops for select to authenticated
  using (id = my_shop_id() or is_super_admin());
create policy shops_update on shops for update to authenticated
  using ((id = current_shop_id() and current_role_name() = 'owner') or is_super_admin())
  with check ((id = current_shop_id() and current_role_name() = 'owner') or is_super_admin());
create policy shops_admin_all on shops for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or shop_id = my_shop_id() or is_super_admin());
create policy profiles_owner_update on profiles for update to authenticated
  using (shop_id = current_shop_id() and current_role_name() = 'owner')
  with check (shop_id = current_shop_id() and role <> 'super_admin');
create policy profiles_admin_all on profiles for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

do $$
declare t text;
begin
  -- everyone in the shop can read; super admin can read all
  foreach t in array array['categories','products','customers','suppliers','sales',
      'sale_items','purchases','purchase_items','due_payments','expenses','stock_adjustments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I for select to authenticated
         using (shop_id = current_shop_id() or is_super_admin())', t || '_select', t);
  end loop;

  -- owner / manager can write catalogue tables
  foreach t in array array['categories','products','suppliers','expenses']
  loop
    execute format(
      'create policy %I on %I for all to authenticated
         using (shop_id = current_shop_id() and current_role_name() in (''owner'',''manager''))
         with check (shop_id = current_shop_id() and current_role_name() in (''owner'',''manager''))',
      t || '_write', t);
  end loop;
end $$;

-- cashiers may also add / edit customers
create policy customers_write on customers for all to authenticated
  using (shop_id = current_shop_id() and current_role_name() in ('owner','manager','cashier'))
  with check (shop_id = current_shop_id() and current_role_name() in ('owner','manager','cashier'));

-- sales, sale_items, purchases, purchase_items, due_payments, stock_adjustments
-- have NO direct write policy: they are written only by the functions below.

-- ---------- 6. Business functions (RPC) ----------

-- New user creates their shop (becomes owner)
create function register_shop(p_shop_name text, p_business_type text, p_full_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_shop uuid;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Already registered';
  end if;
  insert into shops (name, business_type) values (p_shop_name, coalesce(p_business_type,'general'))
    returning id into v_shop;
  insert into shop_counters (shop_id) values (v_shop);
  insert into profiles (id, shop_id, full_name, role) values (auth.uid(), v_shop, p_full_name, 'owner');
  return v_shop;
end $$;

-- Make a sale: totals, stock, due and profit are all automatic.
-- p_items example: [{"product_id":"...","qty":2,"unit_price":50}]  (unit_price optional)
create function create_sale(
  p_customer_id uuid, p_items jsonb,
  p_discount numeric default 0, p_paid numeric default 0,
  p_method pay_method default 'cash')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := current_shop_id();
  v_allow_neg boolean;
  v_sale uuid; v_seq bigint;
  v_subtotal numeric := 0; v_cost numeric := 0;
  v_total numeric; v_paid numeric; v_due numeric; v_price numeric;
  it record; prod record;
begin
  if v_shop is null then raise exception 'Not allowed'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Cart is empty'; end if;
  select allow_negative_stock into v_allow_neg from shops where id = v_shop;

  if p_customer_id is not null and not exists
     (select 1 from customers where id = p_customer_id and shop_id = v_shop) then
    raise exception 'Customer not found';
  end if;

  insert into shop_counters (shop_id, invoice_seq) values (v_shop, 1)
    on conflict (shop_id) do update set invoice_seq = shop_counters.invoice_seq + 1
    returning invoice_seq into v_seq;

  insert into sales (shop_id, invoice_no, customer_id, cashier_id, payment_method, discount)
    values (v_shop, 'INV-' || lpad(v_seq::text, 6, '0'), p_customer_id, auth.uid(), p_method, p_discount)
    returning id into v_sale;

  for it in select * from jsonb_to_recordset(p_items)
            as x(product_id uuid, qty numeric, unit_price numeric)
  loop
    if it.qty is null or it.qty <= 0 then raise exception 'Invalid quantity'; end if;
    select * into prod from products
      where id = it.product_id and shop_id = v_shop and is_active for update;
    if not found then raise exception 'Product not found'; end if;
    if not v_allow_neg and prod.stock_qty < it.qty then
      raise exception 'Not enough stock: %', prod.name;
    end if;

    v_price := coalesce(it.unit_price, prod.sell_price);
    insert into sale_items (sale_id, shop_id, product_id, product_name, qty, unit_price, unit_cost, line_total)
      values (v_sale, v_shop, prod.id, prod.name, it.qty, v_price, prod.buy_price, it.qty * v_price);
    update products set stock_qty = stock_qty - it.qty where id = prod.id;

    v_subtotal := v_subtotal + it.qty * v_price;
    v_cost     := v_cost     + it.qty * prod.buy_price;
  end loop;

  v_total := greatest(v_subtotal - coalesce(p_discount,0), 0);
  v_paid  := least(coalesce(p_paid,0), v_total);
  v_due   := v_total - v_paid;
  if v_due > 0 and p_customer_id is null then
    raise exception 'Select a customer for a due (baki) sale';
  end if;

  update sales set subtotal = v_subtotal, total = v_total, paid = v_paid, due = v_due,
         total_cost = v_cost, profit = v_total - v_cost
   where id = v_sale;

  if v_due > 0 then
    update customers set due_balance = due_balance + v_due where id = p_customer_id;
  end if;
  return v_sale;
end $$;

-- Customer pays back some baki
create function receive_due_payment(
  p_customer_id uuid, p_amount numeric,
  p_method pay_method default 'cash', p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_shop uuid := current_shop_id();
begin
  if v_shop is null then raise exception 'Not allowed'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid amount'; end if;
  update customers set due_balance = greatest(due_balance - p_amount, 0)
   where id = p_customer_id and shop_id = v_shop;
  if not found then raise exception 'Customer not found'; end if;
  insert into due_payments (shop_id, customer_id, amount, method, note, received_by)
    values (v_shop, p_customer_id, p_amount, p_method, p_note, auth.uid());
end $$;

-- Buy stock from a supplier (stock goes up, buy_price = latest cost)
-- p_items example: [{"product_id":"...","qty":10,"unit_cost":40}]
create function receive_purchase(
  p_supplier_id uuid, p_items jsonb, p_paid numeric default 0, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := current_shop_id();
  v_id uuid; v_total numeric := 0; v_paid numeric; v_due numeric; it record;
begin
  if v_shop is null or current_role_name() not in ('owner','manager') then
    raise exception 'Not allowed';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'No items'; end if;
  if p_supplier_id is not null and not exists
     (select 1 from suppliers where id = p_supplier_id and shop_id = v_shop) then
    raise exception 'Supplier not found';
  end if;

  insert into purchases (shop_id, supplier_id, note, created_by)
    values (v_shop, p_supplier_id, p_note, auth.uid()) returning id into v_id;

  for it in select * from jsonb_to_recordset(p_items)
            as x(product_id uuid, qty numeric, unit_cost numeric)
  loop
    update products set stock_qty = stock_qty + it.qty, buy_price = it.unit_cost
     where id = it.product_id and shop_id = v_shop;
    if not found then raise exception 'Product not found'; end if;
    insert into purchase_items (purchase_id, shop_id, product_id, qty, unit_cost)
      values (v_id, v_shop, it.product_id, it.qty, it.unit_cost);
    v_total := v_total + it.qty * it.unit_cost;
  end loop;

  v_paid := least(coalesce(p_paid,0), v_total);
  v_due  := v_total - v_paid;
  update purchases set total = v_total, paid = v_paid, due = v_due where id = v_id;
  if v_due > 0 and p_supplier_id is not null then
    update suppliers set due_balance = due_balance + v_due where id = p_supplier_id;
  end if;
  return v_id;
end $$;

-- Damaged / expired / lost stock (recorded as loss) or a manual correction
create function adjust_stock(
  p_product_id uuid, p_qty_change numeric, p_reason adjust_reason, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_shop uuid := current_shop_id(); v_cost numeric;
begin
  if v_shop is null or current_role_name() not in ('owner','manager') then
    raise exception 'Not allowed';
  end if;
  update products set stock_qty = stock_qty + p_qty_change
   where id = p_product_id and shop_id = v_shop
   returning buy_price into v_cost;
  if not found then raise exception 'Product not found'; end if;
  insert into stock_adjustments (shop_id, product_id, qty_change, reason, loss_amount, note, created_by)
    values (v_shop, p_product_id, p_qty_change, p_reason,
            case when p_qty_change < 0 and p_reason <> 'correction'
                 then abs(p_qty_change) * v_cost else 0 end,
            p_note, auth.uid());
end $$;

-- Profit / loss for a date range (owner only, Bangladesh time)
create function profit_report(p_from date, p_to date)
returns table (sale_count bigint, sales_total numeric, cost_of_goods numeric,
               gross_profit numeric, expenses_total numeric, loss_total numeric, net_profit numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_shop uuid := current_shop_id();
begin
  if v_shop is null or current_role_name() <> 'owner' then
    raise exception 'Not allowed';
  end if;
  return query
  with s as (
    select count(*) as c, coalesce(sum(total),0) as t, coalesce(sum(total_cost),0) as k
      from sales
     where shop_id = v_shop
       and (created_at at time zone 'Asia/Dhaka')::date between p_from and p_to),
  e as (
    select coalesce(sum(amount),0) as a from expenses
     where shop_id = v_shop and expense_date between p_from and p_to),
  l as (
    select coalesce(sum(loss_amount),0) as x from stock_adjustments
     where shop_id = v_shop
       and (created_at at time zone 'Asia/Dhaka')::date between p_from and p_to)
  select s.c, s.t, s.k, s.t - s.k, e.a, l.x, s.t - s.k - e.a - l.x from s, e, l;
end $$;

-- ---------- 7. Function permissions ----------
revoke all on function register_shop(text, text, text)                        from public, anon;
revoke all on function create_sale(uuid, jsonb, numeric, numeric, pay_method) from public, anon;
revoke all on function receive_due_payment(uuid, numeric, pay_method, text)   from public, anon;
revoke all on function receive_purchase(uuid, jsonb, numeric, text)           from public, anon;
revoke all on function adjust_stock(uuid, numeric, adjust_reason, text)       from public, anon;
revoke all on function profit_report(date, date)                              from public, anon;

grant execute on function register_shop(text, text, text)                        to authenticated;
grant execute on function create_sale(uuid, jsonb, numeric, numeric, pay_method) to authenticated;
grant execute on function receive_due_payment(uuid, numeric, pay_method, text)   to authenticated;
grant execute on function receive_purchase(uuid, jsonb, numeric, text)           to authenticated;
grant execute on function adjust_stock(uuid, numeric, adjust_reason, text)       to authenticated;
grant execute on function profit_report(date, date)                              to authenticated;

-- ---------- 8. Make yourself Super Admin ----------
-- 1) Sign up once in your app (or Supabase Auth > Users), copy your user id
-- 2) Uncomment and run:
-- insert into profiles (id, full_name, role) values ('YOUR-AUTH-USER-ID', 'Super Admin', 'super_admin');
