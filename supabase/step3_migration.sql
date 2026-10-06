-- =====================================================================
-- Step 3 migration: hide buy_price from cashiers
-- Run once in Supabase SQL Editor (after pos_schema.sql)
-- =====================================================================

-- Only owner / manager (and super admin) may read the products table directly
drop policy if exists products_select on products;
create policy products_select on products for select to authenticated
  using ((shop_id = current_shop_id() and current_role_name() in ('owner','manager'))
         or is_super_admin());

-- Cashiers use this view: same products, but WITHOUT buy_price
create or replace view pos_products as
  select id, shop_id, category_id, name, sku, barcode, unit,
         sell_price, stock_qty, low_stock_alert, is_active
  from products
  where shop_id = current_shop_id();

revoke all on pos_products from anon, public;
grant select on pos_products to authenticated;
