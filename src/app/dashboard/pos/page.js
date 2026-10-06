'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Receipt from '../Receipt';

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const METHODS = [
  ['cash', 'নগদ'],
  ['mobile', 'মোবাইল'],
  ['card', 'কার্ড'],
];

function friendlyError(msg = '') {
  if (msg.includes('Not enough stock')) return 'স্টক যথেষ্ট নেই: ' + (msg.split(': ')[1] || '');
  if (msg.includes('Select a customer')) return 'বাকিতে বিক্রি করতে কাস্টমার বেছে নিন';
  if (msg.includes('Cart is empty')) return 'কার্ট খালি';
  if (msg.includes('Not allowed')) return 'বিক্রি করা যাচ্ছে না। আপনার দোকান সক্রিয় আছে কি না দেখুন।';
  return 'বিক্রি সেভ হয়নি: ' + msg;
}

export default function PosPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchRef = useRef(null);

  const [ctx, setCtx] = useState(null);
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]); // {id,name,unit,price,stock,qty}
  const [discount, setDiscount] = useState('');
  const [paid, setPaid] = useState(''); // '' = সম্পূর্ণ পরিশোধ
  const [method, setMethod] = useState('cash');
  const [customerId, setCustomerId] = useState('');

  const [busy, setBusy] = useState(false);
  const [saleError, setSaleError] = useState('');
  const [receipt, setReceipt] = useState(null);

  const [newCust, setNewCust] = useState(null); // {name, phone}
  const [custBusy, setCustBusy] = useState(false);

  const canEditPrice = !!ctx && ['owner', 'manager'].includes(ctx.role);
  const allowNeg = !!shop?.allow_negative_stock;

  function flash(msg) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  }

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from('profiles')
      .select('role, shop_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!prof || !prof.shop_id) {
      setError('এই অ্যাকাউন্টে কোনো দোকান যুক্ত নেই');
      setLoading(false);
      return;
    }
    setCtx({ role: prof.role, shopId: prof.shop_id });

    const [p, c, s] = await Promise.all([
      supabase.from('pos_products').select('*').eq('is_active', true).order('name'),
      supabase.from('customers').select('id, name, phone, due_balance').order('name'),
      supabase.from('shops').select('*').eq('id', prof.shop_id).maybeSingle(),
    ]);
    if (p.error) setError('পণ্য লোড করা যায়নি: ' + p.error.message);
    setProducts(p.data ?? []);
    setCustomers(c.data ?? []);
    setShop(s.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- পণ্য খোঁজা ---------- */
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(s) ||
            (p.barcode || '').toLowerCase() === s ||
            (p.sku || '').toLowerCase() === s ||
            (p.barcode || '').toLowerCase().includes(s)
        )
      : products;
    return list.slice(0, 60);
  }, [products, q]);

  function addToCart(p) {
    const stock = Number(p.stock_qty);
    const existing = cart.find((i) => i.id === p.id);
    const nextQty = (existing ? num(existing.qty) : 0) + 1;
    if (!allowNeg && nextQty > stock) {
      flash(`"${p.name}" এর স্টকে মাত্র ${stock} ${p.unit} আছে`);
      return;
    }
    if (existing) {
      setCart(cart.map((i) => (i.id === p.id ? { ...i, qty: String(nextQty) } : i)));
    } else {
      setCart([
        ...cart,
        { id: p.id, name: p.name, unit: p.unit, price: String(p.sell_price), stock, qty: '1' },
      ]);
    }
  }

  // বারকোড স্ক্যানার / Enter চাপলে
  function onSearchKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const s = q.trim().toLowerCase();
    if (!s) return;
    const exact = products.find(
      (p) => (p.barcode || '').toLowerCase() === s || (p.sku || '').toLowerCase() === s
    );
    const target = exact || (shown.length === 1 ? shown[0] : null);
    if (target) {
      addToCart(target);
      setQ('');
      searchRef.current?.focus();
    } else {
      flash('পণ্য পাওয়া যায়নি');
    }
  }

  const setItem = (id, patch) => setCart(cart.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const removeItem = (id) => setCart(cart.filter((i) => i.id !== id));
  function step(i, delta) {
    const q2 = Math.round((num(i.qty) + delta) * 1000) / 1000;
    if (q2 <= 0) return removeItem(i.id);
    if (!allowNeg && q2 > i.stock) return flash(`স্টকে মাত্র ${i.stock} ${i.unit} আছে`);
    setItem(i.id, { qty: String(q2) });
  }

  /* ---------- হিসাব ---------- */
  const subtotal = cart.reduce((a, i) => a + num(i.qty) * num(i.price), 0);
  const discountNum = Math.min(Math.max(num(discount), 0), subtotal);
  const total = Math.max(subtotal - discountNum, 0);
  const paidNum = paid === '' ? total : Math.min(Math.max(num(paid), 0), total);
  const due = Math.round((total - paidNum) * 100) / 100;
  const customer = customers.find((c) => c.id === customerId);

  /* ---------- বিক্রি সেভ ---------- */
  async function submit() {
    setSaleError('');
    if (cart.length === 0) return;
    if (total <= 0) return setSaleError('মোট দাম ০ হলে বিক্রি করা যাবে না');
    for (const i of cart) {
      if (!(num(i.qty) > 0)) return setSaleError(`"${i.name}" এর পরিমাণ ঠিক করুন`);
      if (!allowNeg && num(i.qty) > i.stock) return setSaleError(`"${i.name}" এর স্টক যথেষ্ট নেই`);
    }
    if (due > 0 && !customerId) return setSaleError('বাকিতে বিক্রি করতে কাস্টমার বেছে নিন');

    setBusy(true);
    const items = cart.map((i) => ({ product_id: i.id, qty: num(i.qty), unit_price: num(i.price) }));
    const usedMethod = paidNum === 0 ? 'due' : method;
    const { data: saleId, error } = await supabase.rpc('create_sale', {
      p_customer_id: customerId || null,
      p_items: items,
      p_discount: discountNum,
      p_paid: paidNum,
      p_method: usedMethod,
    });
    if (error) {
      setBusy(false);
      return setSaleError(friendlyError(error.message));
    }

    const [s, it] = await Promise.all([
      supabase.from('pos_sales').select('*').eq('id', saleId).maybeSingle(),
      supabase.from('pos_sale_items').select('*').eq('sale_id', saleId),
    ]);
    if (s.data) {
      setReceipt({ sale: s.data, items: it.data ?? [], customer, shop });
    } else {
      flash('বিক্রি সেভ হয়েছে (রসিদ লোড হয়নি — step4_migration.sql রান করেছেন কি?)');
    }

    setCart([]);
    setDiscount('');
    setPaid('');
    setMethod('cash');
    setCustomerId('');
    setBusy(false);
    load(); // স্টক ও বাকি নতুন করে আনা
  }

  /* ---------- নতুন কাস্টমার ---------- */
  async function addCustomer(e) {
    e.preventDefault();
    if (!newCust.name.trim()) return;
    setCustBusy(true);
    const { data, error } = await supabase
      .from('customers')
      .insert({ shop_id: ctx.shopId, name: newCust.name.trim(), phone: newCust.phone.trim() || null })
      .select('id, name, phone, due_balance')
      .single();
    setCustBusy(false);
    if (error) return alert('কাস্টমার যোগ করা যায়নি: ' + error.message);
    setCustomers([...customers, data].sort((a, b) => a.name.localeCompare(b.name)));
    setCustomerId(data.id);
    setNewCust(null);
  }

  if (loading) return <p className="text-slate-500">লোড হচ্ছে...</p>;
  if (error && !ctx) return <p className="text-red-600">{error}</p>;

  return (
    <div className="pb-24 md:pb-0">
      {notice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-20 bg-slate-800 text-white text-sm rounded-lg px-4 py-2 shadow">
          {notice}
        </div>
      )}
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="grid md:grid-cols-5 gap-4">
        {/* ---------- বাম: পণ্য ---------- */}
        <section className="md:col-span-3">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="পণ্যের নাম লিখুন বা বারকোড স্ক্যান করুন"
            className="w-full border rounded-xl px-4 py-3 bg-white outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
          />

          {products.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center text-slate-500">
              আগে "পণ্য" মেনু থেকে পণ্য যোগ করুন।
            </div>
          ) : shown.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center text-slate-500">কোনো পণ্য পাওয়া যায়নি।</div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {shown.map((p) => {
                const out = Number(p.stock_qty) <= 0 && !allowNeg;
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={out}
                    className="text-left bg-white border rounded-xl p-3 hover:border-emerald-500 disabled:opacity-50 disabled:hover:border-slate-200"
                  >
                    <div className="font-medium text-sm line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                    <div className="font-bold text-emerald-700 mt-1">
                      {money(p.sell_price)}
                      <span className="text-xs font-normal text-slate-500">/{p.unit}</span>
                    </div>
                    <div className={`text-xs mt-0.5 ${out ? 'text-red-600' : 'text-slate-500'}`}>
                      {out ? 'স্টক শেষ' : `স্টক: ${Number(p.stock_qty)}`}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- ডান: কার্ট ---------- */}
        <section id="cart" className="md:col-span-2 md:sticky md:top-32 self-start scroll-mt-32">
          <div className="bg-white border rounded-xl p-4">
            <h2 className="font-bold mb-3">🛒 কার্ট ({cart.length})</h2>

            {cart.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">পণ্য বেছে নিন</p>
            ) : (
              <div className="space-y-3">
                {cart.map((i) => (
                  <div key={i.id} className="border-b pb-3 last:border-0">
                    <div className="flex justify-between gap-2">
                      <div className="font-medium text-sm">{i.name}</div>
                      <button onClick={() => removeItem(i.id)} className="text-red-500 text-lg leading-none">
                        ×
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <button onClick={() => step(i, -1)} className="w-8 h-8 border rounded-lg">
                        −
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        value={i.qty}
                        onChange={(e) => setItem(i.id, { qty: e.target.value })}
                        className="w-16 border rounded-lg px-2 py-1 text-center"
                      />
                      <button onClick={() => step(i, 1)} className="w-8 h-8 border rounded-lg">
                        +
                      </button>
                      <span className="text-xs text-slate-500">{i.unit} ×</span>
                      {canEditPrice ? (
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={i.price}
                          onChange={(e) => setItem(i.id, { price: e.target.value })}
                          className="w-20 border rounded-lg px-2 py-1"
                        />
                      ) : (
                        <span className="text-sm">{money(i.price)}</span>
                      )}
                      <span className="ml-auto font-semibold text-sm">{money(num(i.qty) * num(i.price))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <>
                {/* কাস্টমার */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm">কাস্টমার</label>
                    <button
                      onClick={() => setNewCust({ name: '', phone: '' })}
                      className="text-xs text-emerald-700"
                    >
                      + নতুন কাস্টমার
                    </button>
                  </div>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full border rounded-lg px-2 py-2 bg-white"
                  >
                    <option value="">— খুচরা (নাম ছাড়া) —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` (${c.phone})` : ''}
                      </option>
                    ))}
                  </select>
                  {customer && Number(customer.due_balance) > 0 && (
                    <p className="text-xs text-amber-700 mt-1">
                      আগের বাকি: {money(customer.due_balance)}
                    </p>
                  )}
                </div>

                {/* ডিসকাউন্ট */}
                <div className="mt-3 flex items-center gap-2">
                  <label className="text-sm w-24">ডিসকাউন্ট (৳)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                    className="flex-1 border rounded-lg px-3 py-2"
                  />
                </div>

                {/* মোট */}
                <div className="mt-4 bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>সাবটোটাল</span>
                    <span>{money(subtotal)}</span>
                  </div>
                  {discountNum > 0 && (
                    <div className="flex justify-between text-slate-600">
                      <span>ডিসকাউন্ট</span>
                      <span>-{money(discountNum)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold">
                    <span>সর্বমোট</span>
                    <span>{money(total)}</span>
                  </div>
                </div>

                {/* পেমেন্ট */}
                <div className="mt-3">
                  <div className="flex gap-2 mb-2">
                    {METHODS.map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => setMethod(v)}
                        className={`flex-1 border rounded-lg py-1.5 text-sm ${
                          method === v ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm w-24">পরিশোধ (৳)</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={paid}
                      onChange={(e) => setPaid(e.target.value)}
                      placeholder={String(total)}
                      className="flex-1 border rounded-lg px-3 py-2"
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setPaid('')} className="flex-1 text-xs border rounded-lg py-1.5">
                      সম্পূর্ণ পরিশোধ
                    </button>
                    <button onClick={() => setPaid('0')} className="flex-1 text-xs border rounded-lg py-1.5">
                      পুরো বাকি
                    </button>
                  </div>
                  {due > 0 && (
                    <p className="text-sm font-semibold text-amber-700 mt-2">বাকি থাকবে: {money(due)}</p>
                  )}
                </div>

                {saleError && <p className="text-sm text-red-600 mt-3">{saleError}</p>}

                <button
                  onClick={submit}
                  disabled={busy}
                  className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-bold disabled:opacity-60"
                >
                  {busy ? 'সেভ হচ্ছে...' : `বিক্রি সম্পন্ন করুন • ${money(total)}`}
                </button>
                <button
                  onClick={() => {
                    setCart([]);
                    setSaleError('');
                  }}
                  className="w-full mt-2 text-sm text-slate-500"
                >
                  কার্ট খালি করুন
                </button>
              </>
            )}
          </div>
        </section>
      </div>

      {/* মোবাইলে ভাসমান কার্ট বাটন */}
      {cart.length > 0 && (
        <a
          href="#cart"
          className="md:hidden fixed bottom-4 left-4 right-4 z-10 bg-emerald-600 text-white rounded-xl py-3 px-4 shadow-lg flex justify-between font-semibold"
        >
          <span>🛒 কার্ট ({cart.length})</span>
          <span>{money(total)} →</span>
        </a>
      )}

      {/* নতুন কাস্টমার */}
      {newCust && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center">
          <form
            onSubmit={addCustomer}
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 space-y-3"
          >
            <h2 className="font-bold">নতুন কাস্টমার</h2>
            <input
              autoFocus
              required
              value={newCust.name}
              onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
              placeholder="নাম *"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              value={newCust.phone}
              onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
              placeholder="ফোন নম্বর"
              inputMode="tel"
              className="w-full border rounded-lg px-3 py-2"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setNewCust(null)} className="flex-1 border rounded-lg py-2.5">
                বাতিল
              </button>
              <button
                disabled={custBusy}
                className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-60"
              >
                যোগ করুন
              </button>
            </div>
          </form>
        </div>
      )}

      {receipt && <Receipt data={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
