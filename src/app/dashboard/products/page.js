'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const UNITS = ['pcs', 'kg', 'gm', 'litre', 'dozen', 'packet', 'box', 'meter'];
const EMPTY = {
  id: null,
  name: '',
  category_id: '',
  unit: 'pcs',
  buy_price: '',
  sell_price: '',
  stock_qty: '',
  low_stock_alert: '5',
  barcode: '',
  sku: '',
  _oldStock: 0,
};

const num = (v) => (v === '' || v == null ? 0 : Number(v));
const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const isLow = (p) => Number(p.stock_qty) <= Number(p.low_stock_alert);

export default function ProductsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState(null); // { role, shopId }
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const canEdit = !!ctx && ['owner', 'manager'].includes(ctx.role);

  async function load() {
    setLoading(true);
    setError('');
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from('profiles')
      .select('role, shop_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!prof) {
      setError('প্রোফাইল লোড করা যায়নি');
      setLoading(false);
      return;
    }
    setCtx({ role: prof.role, shopId: prof.shop_id });

    // ক্যাশিয়ার কেনা দাম ছাড়া view থেকে পড়বে
    const table = ['owner', 'manager'].includes(prof.role) ? 'products' : 'pos_products';
    const [p, c] = await Promise.all([
      supabase.from(table).select('*').order('name'),
      supabase.from('categories').select('*').order('name'),
    ]);
    if (p.error || c.error) setError('ডাটা লোড করতে সমস্যা হয়েছে');
    setProducts(p.data ?? []);
    setCategories(c.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catName = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c.name])), [categories]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => {
      if (cat && p.category_id !== cat) return false;
      if (lowOnly && !isLow(p)) return false;
      if (!s) return true;
      return (
        p.name.toLowerCase().includes(s) ||
        (p.barcode || '').toLowerCase().includes(s) ||
        (p.sku || '').toLowerCase().includes(s)
      );
    });
  }, [products, q, cat, lowOnly]);

  const lowCount = products.filter(isLow).length;
  const stockValue = products.reduce((a, p) => a + Number(p.stock_qty) * Number(p.buy_price || 0), 0);

  function openNew() {
    setFormError('');
    setForm({ ...EMPTY });
  }

  function openEdit(p) {
    setFormError('');
    setForm({
      id: p.id,
      name: p.name,
      category_id: p.category_id || '',
      unit: p.unit,
      buy_price: String(p.buy_price ?? ''),
      sell_price: String(p.sell_price ?? ''),
      stock_qty: String(p.stock_qty ?? ''),
      low_stock_alert: String(p.low_stock_alert ?? ''),
      barcode: p.barcode || '',
      sku: p.sku || '',
      _oldStock: Number(p.stock_qty),
    });
  }

  async function save(e) {
    e.preventDefault();
    setFormError('');
    const name = form.name.trim();
    if (!name) return setFormError('পণ্যের নাম দিন');
    const buy = num(form.buy_price);
    const sell = num(form.sell_price);
    if (buy < 0 || sell < 0) return setFormError('দাম ঋণাত্মক হতে পারে না');

    setSaving(true);
    const payload = {
      name,
      category_id: form.category_id || null,
      unit: form.unit,
      buy_price: buy,
      sell_price: sell,
      low_stock_alert: num(form.low_stock_alert),
      barcode: form.barcode.trim() || null,
      sku: form.sku.trim() || null,
    };

    let err = null;
    if (form.id) {
      ({ error: err } = await supabase.from('products').update(payload).eq('id', form.id));
      const delta = Math.round((num(form.stock_qty) - Number(form._oldStock)) * 1000) / 1000;
      if (!err && delta !== 0) {
        ({ error: err } = await supabase.rpc('adjust_stock', {
          p_product_id: form.id,
          p_qty_change: delta,
          p_reason: 'correction',
          p_note: 'পণ্য এডিট থেকে স্টক সংশোধন',
        }));
      }
    } else {
      ({ error: err } = await supabase
        .from('products')
        .insert({ ...payload, shop_id: ctx.shopId, stock_qty: num(form.stock_qty) }));
    }
    setSaving(false);

    if (err) {
      setFormError(err.code === '23505' ? 'এই বারকোড আগে ব্যবহার করা হয়েছে' : 'সেভ করা যায়নি: ' + err.message);
      return;
    }
    setForm(null);
    load();
  }

  async function remove(p) {
    if (!confirm(`"${p.name}" মুছে ফেলবেন?`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) return alert('মুছা যায়নি: ' + error.message);
    load();
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const margin = form ? num(form.sell_price) - num(form.buy_price) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">📦 পণ্য</h1>
        {canEdit && (
          <button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
            + নতুন পণ্য
          </button>
        )}
      </div>

      {/* সারাংশ */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white border rounded-xl p-3">
          <div className="text-xs text-slate-500">মোট পণ্য</div>
          <div className="text-lg font-bold">{products.length}</div>
        </div>
        <button
          onClick={() => setLowOnly(!lowOnly)}
          className={`text-left border rounded-xl p-3 ${lowOnly ? 'bg-red-50 border-red-300' : 'bg-white'}`}
        >
          <div className="text-xs text-slate-500">কম স্টক</div>
          <div className="text-lg font-bold text-red-600">{lowCount}</div>
        </button>
        {canEdit && (
          <div className="bg-white border rounded-xl p-3">
            <div className="text-xs text-slate-500">স্টক মূল্য</div>
            <div className="text-lg font-bold">{money(stockValue)}</div>
          </div>
        )}
      </div>

      {/* সার্চ ও ফিল্টার */}
      <div className="flex gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="নাম / বারকোড / SKU দিয়ে খুঁজুন"
          className="flex-1 min-w-0 border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="border rounded-lg px-2 py-2 bg-white max-w-[40%]"
        >
          <option value="">সব ক্যাটাগরি</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading ? (
        <p className="text-slate-500">লোড হচ্ছে...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">
          {products.length === 0
            ? canEdit
              ? 'এখনো কোনো পণ্য নেই। "+ নতুন পণ্য" চেপে প্রথম পণ্য যোগ করুন।'
              : 'এখনো কোনো পণ্য নেই।'
            : 'কোনো পণ্য পাওয়া যায়নি।'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const out = Number(p.stock_qty) <= 0;
            return (
              <div key={p.id} className="bg-white border rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {catName[p.category_id] || 'ক্যাটাগরি নেই'}
                    {p.barcode ? ` • ${p.barcode}` : ''}
                  </div>
                  <div className="text-sm mt-1">
                    বিক্রয় <b>{money(p.sell_price)}</b>/{p.unit}
                    {canEdit && <span className="text-slate-400"> • কেনা {money(p.buy_price)}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-sm font-bold ${
                      out ? 'text-red-600' : isLow(p) ? 'text-amber-600' : 'text-emerald-700'
                    }`}
                  >
                    {out ? 'স্টক শেষ' : `${Number(p.stock_qty)} ${p.unit}`}
                  </div>
                  {!out && isLow(p) && <div className="text-xs text-amber-600">কম স্টক</div>}
                  {canEdit && (
                    <div className="mt-1 flex gap-3 justify-end text-xs">
                      <button onClick={() => openEdit(p)} className="text-emerald-700">
                        এডিট
                      </button>
                      <button onClick={() => remove(p)} className="text-red-600">
                        মুছুন
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* যোগ / এডিট ফর্ম */}
      {form && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-end sm:items-center justify-center">
          <form
            onSubmit={save}
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto space-y-3"
          >
            <h2 className="text-lg font-bold">{form.id ? 'পণ্য এডিট' : 'নতুন পণ্য'}</h2>

            <div>
              <label className="block text-sm mb-1">পণ্যের নাম *</label>
              <input
                autoFocus
                required
                value={form.name}
                onChange={set('name')}
                className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">ক্যাটাগরি</label>
                <select
                  value={form.category_id}
                  onChange={set('category_id')}
                  className="w-full border rounded-lg px-2 py-2 bg-white"
                >
                  <option value="">— নেই —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">ইউনিট</label>
                <select value={form.unit} onChange={set('unit')} className="w-full border rounded-lg px-2 py-2 bg-white">
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">কেনা দাম (৳)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={form.buy_price}
                  onChange={set('buy_price')}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">বিক্রয় দাম (৳)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={form.sell_price}
                  onChange={set('sell_price')}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {(form.buy_price !== '' || form.sell_price !== '') && (
              <p className={`text-sm ${margin < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                প্রতি {form.unit} লাভ: {money(margin)}
                {margin < 0 && ' (লোকসানে বিক্রি হবে!)'}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">{form.id ? 'বর্তমান স্টক' : 'শুরুর স্টক'}</label>
                <input
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={form.stock_qty}
                  onChange={set('stock_qty')}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">কম স্টক সতর্কতা</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={form.low_stock_alert}
                  onChange={set('low_stock_alert')}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            {form.id && <p className="text-xs text-slate-500">স্টক বদলালে সেটা "সংশোধন" হিসেবে রেকর্ড হবে।</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">বারকোড</label>
                <input
                  value={form.barcode}
                  onChange={set('barcode')}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">SKU / কোড</label>
                <input
                  value={form.sku}
                  onChange={set('sku')}
                  className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="flex-1 border rounded-lg py-2.5"
              >
                বাতিল
              </button>
              <button
                disabled={saving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 font-medium disabled:opacity-60"
              >
                {saving ? 'সেভ হচ্ছে...' : 'সেভ করুন'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
