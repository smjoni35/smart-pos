'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d) =>
  new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });

export default function PurchasesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState(null);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [mode, setMode] = useState('list'); // 'list' | 'new'
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]); // {id,name,unit,qty,cost,sell}
  const [supplierId, setSupplierId] = useState('');
  const [paid, setPaid] = useState(''); // '' = সম্পূর্ণ পরিশোধ
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const [detail, setDetail] = useState(null); // {purchase, items}

  const allowed = !!ctx && ['owner', 'manager'].includes(ctx.role);

  function flash(msg) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
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
    if (!['owner', 'manager'].includes(prof.role)) {
      setLoading(false);
      return;
    }
    const [p, s, pu] = await Promise.all([
      supabase.from('products').select('id, name, unit, buy_price, sell_price, stock_qty, is_active').order('name'),
      supabase.from('suppliers').select('id, name, due_balance').order('name'),
      supabase.from('purchases').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    if (p.error || s.error || pu.error) setError('ডাটা লোড করতে সমস্যা হয়েছে');
    setProducts(p.data ?? []);
    setSuppliers(s.data ?? []);
    setPurchases(pu.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prodName = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const supName = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products
      .filter((p) => p.is_active && (!s || p.name.toLowerCase().includes(s)))
      .slice(0, 30);
  }, [products, q]);

  function addRow(p) {
    const ex = rows.find((r) => r.id === p.id);
    if (ex) {
      setRows(rows.map((r) => (r.id === p.id ? { ...r, qty: String(num(r.qty) + 1) } : r)));
    } else {
      setRows([
        ...rows,
        { id: p.id, name: p.name, unit: p.unit, qty: '1', cost: String(p.buy_price), sell: Number(p.sell_price) },
      ]);
    }
  }
  const setRow = (id, patch) => setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id) => setRows(rows.filter((r) => r.id !== id));

  const total = rows.reduce((a, r) => a + num(r.qty) * num(r.cost), 0);
  const paidNum = paid === '' ? total : Math.min(Math.max(num(paid), 0), total);
  const due = Math.round((total - paidNum) * 100) / 100;

  function reset() {
    setRows([]);
    setSupplierId('');
    setPaid('');
    setNote('');
    setQ('');
    setFormError('');
  }

  async function submit() {
    setFormError('');
    if (rows.length === 0) return setFormError('কমপক্ষে একটি পণ্য যোগ করুন');
    for (const r of rows) {
      if (!(num(r.qty) > 0)) return setFormError(`"${r.name}" এর পরিমাণ ঠিক করুন`);
      if (num(r.cost) < 0) return setFormError(`"${r.name}" এর দাম ঠিক করুন`);
    }
    if (due > 0 && !supplierId) return setFormError('বাকিতে কিনলে সাপ্লায়ার বেছে নিন');

    setBusy(true);
    const { error } = await supabase.rpc('receive_purchase', {
      p_supplier_id: supplierId || null,
      p_items: rows.map((r) => ({ product_id: r.id, qty: num(r.qty), unit_cost: num(r.cost) })),
      p_paid: paidNum,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return setFormError('সেভ হয়নি: ' + error.message);

    reset();
    setMode('list');
    flash('মাল কেনা সেভ হয়েছে, স্টক বেড়েছে ✓');
    load();
  }

  async function openDetail(p) {
    const { data } = await supabase.from('purchase_items').select('*').eq('purchase_id', p.id);
    setDetail({ purchase: p, items: data ?? [] });
  }

  if (ctx && !allowed) {
    return <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">এই পেজ শুধু মালিক ও ম্যানেজারের জন্য।</p>;
  }
  if (loading) return <p className="text-slate-500">লোড হচ্ছে...</p>;

  return (
    <div>
      {notice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-800 text-white text-sm rounded-lg px-4 py-2 shadow">
          {notice}
        </div>
      )}
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {mode === 'list' ? (
        <>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">🛍️ মাল কেনা</h1>
            <button
              onClick={() => {
                reset();
                setMode('new');
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
            >
              + নতুন ক্রয়
            </button>
          </div>

          {purchases.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center text-slate-500">
              এখনো কোনো ক্রয় নেই। "+ নতুন ক্রয়" চেপে মাল কেনা লিখুন, স্টক নিজে বেড়ে যাবে।
            </div>
          ) : (
            <div className="bg-white border rounded-xl divide-y">
              {purchases.map((p) => (
                <button
                  key={p.id}
                  onClick={() => openDetail(p)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{supName[p.supplier_id] || 'সাপ্লায়ার ছাড়া'}</div>
                    <div className="text-xs text-slate-500">{fmtDate(p.created_at)}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{money(p.total)}</div>
                    {Number(p.due) > 0 && <div className="text-xs text-red-600">বাকি {money(p.due)}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="pb-8">
          <button onClick={() => setMode('list')} className="text-sm text-emerald-700 mb-3">
            ← ফিরে যান
          </button>
          <h1 className="text-xl font-bold mb-4">নতুন ক্রয়</h1>

          <div className="grid md:grid-cols-5 gap-4">
            {/* পণ্য বাছাই */}
            <section className="md:col-span-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="পণ্য খুঁজুন"
                className="w-full border rounded-xl px-4 py-3 bg-white outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
              />
              {products.length === 0 ? (
                <div className="bg-white border rounded-xl p-6 text-center text-slate-500 text-sm">
                  আগে "পণ্য" মেনু থেকে পণ্য যোগ করুন।
                </div>
              ) : (
                <div className="bg-white border rounded-xl divide-y max-h-72 md:max-h-[28rem] overflow-y-auto">
                  {shown.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addRow(p)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex justify-between gap-2"
                    >
                      <span className="text-sm truncate">{p.name}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        স্টক {Number(p.stock_qty)} {p.unit}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* ক্রয়ের তালিকা */}
            <section className="md:col-span-3">
              <div className="bg-white border rounded-xl p-4">
                <h2 className="font-bold mb-3">কেনা মালের তালিকা ({rows.length})</h2>
                {rows.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">বাম দিক থেকে পণ্য বেছে নিন</p>
                ) : (
                  <div className="space-y-3">
                    {rows.map((r) => (
                      <div key={r.id} className="border-b pb-3 last:border-0">
                        <div className="flex justify-between gap-2">
                          <div className="font-medium text-sm">{r.name}</div>
                          <button onClick={() => removeRow(r.id)} className="text-red-500 text-lg leading-none">
                            ×
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 text-sm">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={r.qty}
                            onChange={(e) => setRow(r.id, { qty: e.target.value })}
                            className="w-20 border rounded-lg px-2 py-1 text-center"
                          />
                          <span className="text-xs text-slate-500">{r.unit} × ৳</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            value={r.cost}
                            onChange={(e) => setRow(r.id, { cost: e.target.value })}
                            className="w-24 border rounded-lg px-2 py-1"
                          />
                          <span className="ml-auto font-semibold">{money(num(r.qty) * num(r.cost))}</span>
                        </div>
                        {num(r.cost) > r.sell && (
                          <p className="text-xs text-red-600 mt-1">
                            ⚠️ কেনা দাম বিক্রয় দামের ({money(r.sell)}) চেয়ে বেশি
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {rows.length > 0 && (
                  <>
                    <div className="mt-4">
                      <label className="block text-sm mb-1">সাপ্লায়ার</label>
                      <select
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                        className="w-full border rounded-lg px-2 py-2 bg-white"
                      >
                        <option value="">— সাপ্লায়ার ছাড়া (নগদ কেনা) —</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {Number(s.due_balance) > 0 ? ` (দেনা ${money(s.due_balance)})` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-slate-500 mt-1">
                        নতুন সাপ্লায়ার লাগলে আগে "সাপ্লায়ার" মেনুতে যোগ করুন।
                      </p>
                    </div>

                    <div className="mt-3 bg-slate-50 rounded-lg p-3 flex justify-between text-lg font-bold">
                      <span>মোট</span>
                      <span>{money(total)}</span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
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
                    {due > 0 && <p className="text-sm font-semibold text-red-600 mt-2">সাপ্লায়ারের বাকি: {money(due)}</p>}

                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="নোট / চালান নম্বর (ঐচ্ছিক)"
                      className="w-full border rounded-lg px-3 py-2 mt-3"
                    />

                    {formError && <p className="text-sm text-red-600 mt-3">{formError}</p>}

                    <button
                      onClick={submit}
                      disabled={busy}
                      className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 font-bold disabled:opacity-60"
                    >
                      {busy ? 'সেভ হচ্ছে...' : `ক্রয় সেভ করুন • ${money(total)}`}
                    </button>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ক্রয়ের বিস্তারিত */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold">{supName[detail.purchase.supplier_id] || 'সাপ্লায়ার ছাড়া'}</h2>
                <div className="text-sm text-slate-500">{fmtDate(detail.purchase.created_at)}</div>
                {detail.purchase.note && <div className="text-sm text-slate-500">{detail.purchase.note}</div>}
              </div>
              <button onClick={() => setDetail(null)} className="text-2xl leading-none text-slate-400">
                ×
              </button>
            </div>

            <div className="divide-y border rounded-xl mt-4">
              {detail.items.map((i) => (
                <div key={i.id} className="px-3 py-2 flex justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{prodName[i.product_id]?.name || 'মুছে ফেলা পণ্য'}</span>
                  <span className="whitespace-nowrap text-slate-600">
                    {Number(i.qty)} × {Number(i.unit_cost)} = {money(Number(i.qty) * Number(i.unit_cost))}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between font-bold text-base">
                <span>মোট</span>
                <span>{money(detail.purchase.total)}</span>
              </div>
              <div className="flex justify-between">
                <span>পরিশোধ</span>
                <span>{money(detail.purchase.paid)}</span>
              </div>
              {Number(detail.purchase.due) > 0 && (
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>বাকি</span>
                  <span>{money(detail.purchase.due)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
