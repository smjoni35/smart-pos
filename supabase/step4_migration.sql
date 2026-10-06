-- =====================================================================
-- Step 4 migration: hide profit / cost from cashiers on sales data
-- Run once in Supabase SQL Editor (after step3_migration.sql)
-- =====================================================================

-- Only owner / manager (and super admin) may read raw sales tables
drop policy if exists sales_select on sales;
create policy sales_select on sales for select to authenticated
  using ((shop_id = current_shop_id() and current_role_name() in ('owner','manager'))
         or is_super_admin());

drop policy if exists sale_items_select on sale_items;
create policy sale_items_select on sale_items for select to authenticated
  using ((shop_id = current_shop_id() and current_role_name() in ('owner','manager'))
         or is_super_admin());

-- Safe views for the app: no cost / profit columns.
-- Owner & manager see all sales; a cashier sees only their own.
create or replace view pos_sales as
  select id, shop_id, invoice_no, customer_id, cashier_id,
         subtotal, discount, total, paid, due, payment_method, created_at
  from sales
  where shop_id = current_shop_id()
    and (current_role_name() in ('owner','manager') or cashier_id = auth.uid());

create or replace view pos_sale_items as
  select i.id, i.sale_id, i.shop_id, i.product_id, i.product_name,
         i.qty, i.unit_price, i.line_total
  from sale_items i
  join sales s on s.id = i.sale_id
  where i.shop_id = current_shop_id()
    and (current_role_name() in ('owner','manager') or s.cashier_id = auth.uid());

revoke all on pos_sales, pos_sale_items from anon, public;
grant select on pos_sales, pos_sale_items to authenticated;
