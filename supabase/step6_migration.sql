-- =====================================================================
-- Step 6 migration: reports & dashboard summary functions
-- Run once in Supabase SQL Editor (after step5_migration.sql)
-- All amounts use Bangladesh time (Asia/Dhaka) for "today / this month".
-- =====================================================================

-- Daily sales for a date range (owner / manager)
create or replace function sales_by_day(p_from date, p_to date)
returns table (day date, sale_count bigint, sales_total numeric, profit numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_shop uuid := current_shop_id();
begin
  if v_shop is null or current_role_name() not in ('owner','manager') then
    raise exception 'Not allowed';
  end if;
  return query
    select (s.created_at at time zone 'Asia/Dhaka')::date,
           count(*)::bigint,
           coalesce(sum(s.total), 0),
           coalesce(sum(s.profit), 0)
      from sales s
     where s.shop_id = v_shop
       and (s.created_at at time zone 'Asia/Dhaka')::date between p_from and p_to
     group by 1
     order by 1;
end $$;

-- Best selling products for a date range (owner / manager)
create or replace function top_products(p_from date, p_to date, p_limit int default 10)
returns table (product_name text, qty_sold numeric, revenue numeric, profit numeric)
language plpgsql stable security definer set search_path = public as $$
declare v_shop uuid := current_shop_id();
begin
  if v_shop is null or current_role_name() not in ('owner','manager') then
    raise exception 'Not allowed';
  end if;
  return query
    select i.product_name,
           sum(i.qty),
           sum(i.line_total),
           sum(i.line_total - i.qty * i.unit_cost)
      from sale_items i
      join sales s on s.id = i.sale_id
     where i.shop_id = v_shop
       and (s.created_at at time zone 'Asia/Dhaka')::date between p_from and p_to
     group by i.product_name
     order by sum(i.line_total) desc
     limit greatest(p_limit, 1);
end $$;

-- Home dashboard numbers (owner / manager)
create or replace function dashboard_summary()
returns table (today_sales numeric, today_count bigint, today_profit numeric,
               month_sales numeric, month_profit numeric,
               cust_due numeric, supplier_due numeric,
               low_stock_count bigint, out_stock_count bigint, stock_value numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_shop  uuid := current_shop_id();
  v_today date := (now() at time zone 'Asia/Dhaka')::date;
  v_month date := date_trunc('month', (now() at time zone 'Asia/Dhaka'))::date;
begin
  if v_shop is null or current_role_name() not in ('owner','manager') then
    raise exception 'Not allowed';
  end if;
  return query
  select
    (select coalesce(sum(s.total),0)  from sales s where s.shop_id = v_shop and (s.created_at at time zone 'Asia/Dhaka')::date = v_today),
    (select count(*)                  from sales s where s.shop_id = v_shop and (s.created_at at time zone 'Asia/Dhaka')::date = v_today),
    (select coalesce(sum(s.profit),0) from sales s where s.shop_id = v_shop and (s.created_at at time zone 'Asia/Dhaka')::date = v_today),
    (select coalesce(sum(s.total),0)  from sales s where s.shop_id = v_shop and (s.created_at at time zone 'Asia/Dhaka')::date >= v_month),
    (select coalesce(sum(s.profit),0) from sales s where s.shop_id = v_shop and (s.created_at at time zone 'Asia/Dhaka')::date >= v_month),
    (select coalesce(sum(c.due_balance),0) from customers c where c.shop_id = v_shop),
    (select coalesce(sum(x.due_balance),0) from suppliers x where x.shop_id = v_shop),
    (select count(*) from products p where p.shop_id = v_shop and p.is_active and p.stock_qty > 0 and p.stock_qty <= p.low_stock_alert),
    (select count(*) from products p where p.shop_id = v_shop and p.is_active and p.stock_qty <= 0),
    (select coalesce(sum(p.stock_qty * p.buy_price),0) from products p where p.shop_id = v_shop and p.is_active and p.stock_qty > 0);
end $$;

revoke all on function sales_by_day(date, date)        from public, anon;
revoke all on function top_products(date, date, int)   from public, anon;
revoke all on function dashboard_summary()             from public, anon;
grant execute on function sales_by_day(date, date)      to authenticated;
grant execute on function top_products(date, date, int) to authenticated;
grant execute on function dashboard_summary()           to authenticated;
