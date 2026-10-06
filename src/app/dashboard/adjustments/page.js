'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { todayStr, monthStart } from '@/lib/dates';

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d) =>
  new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
const REASON = { damaged: 'ভেঙে/নষ্ট', expired: 'মেয়াদ শেষ', lost: 'হারিয়েছে/চুরি', correction: 'সংশোধন' };

export default function AdjustmentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState(null);
  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]);
  const [monthLoss, setMonthLoss] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState(null); // {product, qty, reason, note}
  const [q, setQ] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const allowed = !!ctx && ['owner', 'manager'].includes(ctx.role);

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
    const mStart = `${monthStart(todayStr())}T00:00:00+06:00`;
    const [p, a, m] = await Promise.all([
      supabase.from('products').select('id, name, unit, buy_price, stock_qty').order('name'),
      supabase.from('stock_adjustments').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('stock_adjustments').select('loss_amount').gte('created_at', mStart).limit(2000),
    ]);
    if (p.error || a.error) setError('ডাটা লোড করতে সমস্যা হয়েছে');
    setProducts(p.data ?? []);
    setRows(a.data ?? []);
    setMonthLoss((m.data ?? []).reduce((s, r) => s + Number(r.loss_amount), 0));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prodMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return products.filter((p) => !s || p.name.toLowerCase().includes(s)).slice(0, 20);
  }, [products, q]);

  async function save(e) {
    e.preventDefault();
    setFormError('');
    if (!form.product) return setFormError('একটি পণ্য বেছে নিন');
    const qty = num(form.qty);
    if (qty <= 0) return setFormError('পরিমাণ দিন');
    if (qty > Number(form.product.stock_qty)) {
      return setFormError(`স্টকে মাত্র ${Number(form.product.stock_qty)} ${form.product.unit} আছে`);
    }
    setSaving(true);
    const { error } = await supabase.rpc('adjust_stock', {
      p_product_id: form.product.id,
      p_qty_change: -qty,
      p_reason: form.reason,
      p_note: form.note.trim() || null,
    });
    setSaving(false);
    if (error) return setFormError('সেভ হয়নি: ' + error.message);
    setForm(null);
    setQ('');
    load();
  }

  if (ctx && !allowed) {
    return <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">এই পেজ শুধু মালিক ও ম্যানেজারের জন্য।</p>;
  }
  if (loading) return <p className="text-slate-500">লোড হচ্ছে...</p>;

  const lossPreview = form?.product ? num(form.qty) * Number(form.product.buy_price) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">🗑️ নষ্ট মাল</h1>
        <button
          onClick={() => {
            setFormError('');
            setQ('');
            setForm({ product: null, qty: '', reason: 'damaged', note: '' });
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          + নষ্ট মাল লিখুন
        </button>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-4">
        <div className="text-xs text-slate-500">এই মাসে ক্ষতি (কেনা দামে)</div>
        <div className="text-2xl font-bold text-red-600">{money(monthLoss)}</div>
        <p className="text-xs text-slate-500 mt-1">
          নষ্ট, মেয়াদোত্তীর্ণ বা হারানো মাল এখানে লিখলে স্টক কমে যায় এবং লাভ-ক্ষতি রিপোর্টে ক্ষতি হিসেবে ধরা হয়।
        </p>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {rows.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">এখনো কোনো রেকর্ড নেই।</div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {rows.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{prodMap[r.product_id]?.name || 'মুছে ফেলা পণ্য'}</div>
                <div className="text-xs text-slate-500">
                  {fmtDate(r.created_at)} • {REASON[r.reason]}
                  {r.note ? ` • ${r.note}` : ''}
                </div>
              </div>
              <div className="text-right">
                <div className={`font-semibold ${Number(r.qty_change) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {Number(r.qty_change) > 0 ? '+' : ''}
                  {Number(r.qty_change)} {prodMap[r.product_id]?.unit || ''}
                </div>
                {Number(r.loss_amount) > 0 && (
                  <div className="text-xs text-red-500">ক্ষতি {money(r.loss_amount)}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center">
          <form
            onSubmit={save}
            className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto space-y-3"
          >
            <h2 className="font-bold">নষ্ট / হারানো মাল</h2>

            {form.product ? (
              <div className="bg-slate-50 border rounded-lg p-3 flex justify-between items-center">
                <div>
                  <div className="font-medium">{form.product.name}</div>
                  <div className="text-xs text-slate-500">
                    স্টক: {Number(form.product.stock_qty)} {form.product.unit}
                  </div>
                </div>
                <button type="button" onClick={() => setForm({ ...form, product: null })} className="text-xs text-emerald-700">
                  বদলান
                </button>
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="পণ্য খুঁজুন"
                  className="w-full border rounded-lg px-3 py-2"
                />
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {matches.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setForm({ ...form, product: p })}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between text-sm"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        স্টক {Number(p.stock_qty)} {p.unit}
                      </span>
                    </button>
                  ))}
                  {matches.length === 0 && <div className="p-3 text-sm text-slate-500">কোনো পণ্য নেই</div>}
                </div>
              </>
            )}

            <div className="flex gap-2">
              {['damaged', 'expired', 'lost'].map((k) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setForm({ ...form, reason: k })}
                  className={`flex-1 border rounded-lg py-1.5 text-sm ${
                    form.reason === k ? 'bg-emerald-600 text-white border-emerald-600' : ''
                  }`}
                >
                  {REASON[k]}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm mb-1">
                কতটুকু নষ্ট হয়েছে {form.product ? `(${form.product.unit})` : ''}
              </label>
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
              />
              {lossPreview > 0 && <p className="text-sm text-red-600 mt-1">ক্ষতি: {money(lossPreview)}</p>}
            </div>

            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="নোট (ঐচ্ছিক)"
              className="w-full border rounded-lg px-3 py-2"
            />

            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setForm(null)} className="flex-1 border rounded-lg py-2.5">
                বাতিল
              </button>
              <button
                disabled={saving}
                className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-60"
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
