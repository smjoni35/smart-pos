-- =====================================================================
-- Step 8 migration: super admin panel + trial enforcement
-- Run once in Supabase SQL Editor (after step7_migration.sql)
--
-- SUPER ADMIN SETUP (one time, use a SEPARATE email from any shop owner):
--   1) Sign up with that email in the app, but do NOT create a shop
--   2) Copy the user id from Supabase > Authentication > Users and run:
--      insert into profiles (id, full_name, role)
--      values ('YOUR-AUTH-USER-ID', 'Super Admin', 'super_admin');
--
-- OPTIONAL: manual approval for new shops (default is active + 30-day trial):
--      alter table shops alter column status set default 'pending';
-- =====================================================================

-- 1) A shop only works while it is active AND its trial has not expired
--    (trial_ends_at = null means no expiry / paid)
create or replace function current_shop_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.shop_id
    from profiles p
    join shops s on s.id = p.shop_id
   where p.id = auth.uid()
     and p.is_active
     and s.status = 'active'
     and (s.trial_ends_at is null or s.trial_ends_at > now())
$$;

-- 2) Audit log of every admin action
create table if not exists admin_audit_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references profiles(id) on delete set null,
  shop_id    uuid references shops(id) on delete set null,
  shop_name  text,
  action     text not null,
  detail     text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created on admin_audit_log (created_at desc);

alter table admin_audit_log enable row level security;
drop policy if exists admin_audit_select on admin_audit_log;
create policy admin_audit_select on admin_audit_log for select to authenticated
  using (is_super_admin());

-- 3) Overview of every shop (super admin only)
create or replace function admin_shop_overview()
returns table (
  shop_id uuid, name text, business_type text, phone text, address text,
  status shop_status, trial_ends_at timestamptz, created_at timestamptz,
  owner_name text, owner_email text,
  staff_count bigint, product_count bigint, customer_count bigint,
  sale_count bigint, sales_total numeric, last_sale_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Not allowed'; end if;
  return query
  select s.id, s.name, s.business_type, s.phone, s.address,
         s.status, s.trial_ends_at, s.created_at,
         o.full_name, u.email::text,
         (select count(*) from profiles  p where p.shop_id = s.id),
         (select count(*) from products  p where p.shop_id = s.id),
         (select count(*) from customers c where c.shop_id = s.id),
         (select count(*) from sales     x where x.shop_id = s.id),
         (select coalesce(sum(x.total), 0) from sales x where x.shop_id = s.id),
         (select max(x.created_at)         from sales x where x.shop_id = s.id)
    from shops s
    left join lateral (
      select p.id, p.full_name from profiles p
       where p.shop_id = s.id and p.role = 'owner'
       order by p.created_at limit 1) o on true
    left join auth.users u on u.id = o.id
   order by s.created_at desc;
end $$;

-- 4) Approve / suspend / re-activate a shop
create or replace function admin_set_shop_status(
  p_shop_id uuid, p_status shop_status, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Not allowed'; end if;
  update shops set status = p_status where id = p_shop_id;
  if not found then raise exception 'Shop not found'; end if;
  insert into admin_audit_log (admin_id, shop_id, shop_name, action, detail)
    values (auth.uid(), p_shop_id, (select name from shops where id = p_shop_id),
            'status:' || p_status::text, p_note);
end $$;

-- 5) Extend the trial by N days, or p_days = null for "no expiry" (paid)
create or replace function admin_set_trial(p_shop_id uuid, p_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_super_admin() then raise exception 'Not allowed'; end if;
  if p_days is null then
    update shops set trial_ends_at = null where id = p_shop_id;
  else
    if p_days <= 0 or p_days > 3650 then raise exception 'Invalid days'; end if;
    update shops
       set trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
     where id = p_shop_id;
  end if;
  if not found then raise exception 'Shop not found'; end if;
  insert into admin_audit_log (admin_id, shop_id, shop_name, action, detail)
    values (auth.uid(), p_shop_id, (select name from shops where id = p_shop_id),
            case when p_days is null then 'trial:unlimited' else 'trial:+' || p_days::text end,
            null);
end $$;

revoke all on function admin_shop_overview()                              from public, anon;
revoke all on function admin_set_shop_status(uuid, shop_status, text)     from public, anon;
revoke all on function admin_set_trial(uuid, int)                         from public, anon;
grant execute on function admin_shop_overview()                           to authenticated;
grant execute on function admin_set_shop_status(uuid, shop_status, text)  to authenticated;
grant execute on function admin_set_trial(uuid, int)                      to authenticated;
