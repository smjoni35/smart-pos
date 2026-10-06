-- =====================================================================
-- Step 5 migration: customers/suppliers ledger, purchases
-- Run once in Supabase SQL Editor (after step4_migration.sql)
-- =====================================================================

-- 1) Nobody can edit a due balance directly from the app.
--    Balances change only through the secure functions (they run as the DB owner).
create or replace function protect_party_balance() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.due_balance := 0;
    elsif new.due_balance is distinct from old.due_balance then
      raise exception 'due_balance can only change through app functions';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_customer_balance on customers;
create trigger trg_protect_customer_balance
  before insert or update on customers
  for each row execute function protect_party_balance();

drop trigger if exists trg_protect_supplier_balance on suppliers;
create trigger trg_protect_supplier_balance
  before insert or update on suppliers
  for each row execute function protect_party_balance();

-- 2) New tables
create table if not exists opening_balances (      -- "purano baki" from the paper khata
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references shops(id) on delete cascade,
  party_type text not null check (party_type in ('customer','supplier')),
  party_id   uuid not null,
  amount     numeric(14,2) not null check (amount > 0),
  note       text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists supplier_payments (     -- shop pays a supplier
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  method      pay_method not null default 'cash',
  note        text,
  paid_by     uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists opening_balances_party on opening_balances (shop_id, party_type, party_id);
create index if not exists supplier_payments_supplier on supplier_payments (shop_id, supplier_id, created_at desc);

alter table opening_balances  enable row level security;
alter table supplier_payments enable row level security;

drop policy if exists opening_balances_select on opening_balances;
create policy opening_balances_select on opening_balances for select to authenticated
  using ((shop_id = current_shop_id()
          and (party_type = 'customer' or current_role_name() in ('owner','manager')))
         or is_super_admin());

drop policy if exists supplier_payments_select on supplier_payments;
create policy supplier_payments_select on supplier_payments for select to authenticated
  using ((shop_id = current_shop_id() and current_role_name() in ('owner','manager'))
         or is_super_admin());

-- 3) Cost-related tables become owner/manager only (cashiers must not see purchase costs)
do $$
declare t text;
begin
  foreach t in array array['suppliers','purchases','purchase_items','expenses','stock_adjustments']
  loop
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format(
      'create policy %I on %I for select to authenticated
         using ((shop_id = current_shop_id() and current_role_name() in (''owner'',''manager''))
                or is_super_admin())', t || '_select', t);
  end loop;
end $$;

-- 4) Functions
create or replace function add_opening_balance(
  p_party_type text, p_party_id uuid, p_amount numeric, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_shop uuid := current_shop_id();
begin
  if v_shop is null or current_role_name() not in ('owner','manager') then
    raise exception 'Not allowed';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid amount'; end if;

  if p_party_type = 'customer' then
    update customers set due_balance = due_balance + p_amount
     where id = p_party_id and shop_id = v_shop;
  elsif p_party_type = 'supplier' then
    update suppliers set due_balance = due_balance + p_amount
     where id = p_party_id and shop_id = v_shop;
  else
    raise exception 'Invalid party type';
  end if;
  if not found then raise exception 'Party not found'; end if;

  insert into opening_balances (shop_id, party_type, party_id, amount, note, created_by)
    values (v_shop, p_party_type, p_party_id, p_amount, p_note, auth.uid());
end $$;

create or replace function pay_supplier_due(
  p_supplier_id uuid, p_amount numeric,
  p_method pay_method default 'cash', p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_shop uuid := current_shop_id();
begin
  if v_shop is null or current_role_name() not in ('owner','manager') then
    raise exception 'Not allowed';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Invalid amount'; end if;
  update suppliers set due_balance = greatest(due_balance - p_amount, 0)
   where id = p_supplier_id and shop_id = v_shop;
  if not found then raise exception 'Supplier not found'; end if;
  insert into supplier_payments (shop_id, supplier_id, amount, method, note, paid_by)
    values (v_shop, p_supplier_id, p_amount, p_method, p_note, auth.uid());
end $$;

revoke all on function add_opening_balance(text, uuid, numeric, text)       from public, anon;
revoke all on function pay_supplier_due(uuid, numeric, pay_method, text)    from public, anon;
grant execute on function add_opening_balance(text, uuid, numeric, text)    to authenticated;
grant execute on function pay_supplier_due(uuid, numeric, pay_method, text) to authenticated;
