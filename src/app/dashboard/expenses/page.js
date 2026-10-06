'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { todayStr, quickRange } from '@/lib/dates';

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const CATS = ['ভাড়া', 'বেতন', 'বিদ্যুৎ/পানি', 'পরিবহন', 'মেরামত', 'মার্কেটিং', 'অন্যান্য'];

export default function ExpensesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState(null);
  const [[from, to], setRange] = useState(quickRange('month'));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const allowed = !!ctx && ['owner', 'manager'].includes(ctx.role);

  async function load() {
    setLoading(true);
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
    setCtx({ role: prof.role, shopId: prof.shop_id, userId: user.id });
    if (!['owner', 'manager'].includes(prof.role)) {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .gte('expense_date', from)
      .lte('expense_date', to)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) setError('খরচ লোড হয়নি: ' + error.message);
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const total = rows.reduce((a, r) => a + Number(r.amount), 0);
  const byCat = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      const k = r.category || 'অন্যান্য';
      m[k] = (m[k] || 0) + Number(r.amount);
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  async function save(e) {
    e.preventDefault();
    setFormError('');
    const title = form.title.trim();
    const amount = num(form.amount);
    if (!title) return setFormError('খরচের বিবরণ দিন');
    if (amount <= 0) return setFormError('টাকার পরিমাণ দিন');
    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      shop_id: ctx.shopId,
      title,
      category: form.category || null,
      amount,
      expense_date: form.date,
      created_by: ctx.userId,
    });
    setSaving(false);
    if (error) return setFormError('সেভ করা যায়নি: ' + error.message);
    setForm(null);
    load();
  }

  async function remove(r) {
    if (!confirm(`"${r.title}" (${money(r.amount)}) মুছে ফেলবেন?`)) return;
    const { error } = await supabase.from('expenses').delete().eq('id', r.id);
    if (error) return alert('মুছা যায়নি: ' + error.message);
    load();
  }

  if (ctx && !allowed) {
    return <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">এই পেজ শুধু মালিক ও ম্যানেজারের জন্য।</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">💸 খরচ</h1>
        <button
          onClick={() => {
            setFormError('');
            setForm({ title: '', category: 'অন্যান্য', amount: '', date: todayStr() });
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          + নতুন খরচ
        </button>
      </div>

      <div className="bg-white border rounded-xl p-3 mb-4">
        <div className="flex gap-2 mb-2 text-sm flex-wrap">
          {[
            ['today', 'আজ'],
            ['week', 'গত ৭ দিন'],
            ['month', 'এই মাস'],
            ['lastMonth', 'গত মাস'],
          ].map(([k, label]) => (
            <button key={k} onClick={() => setRange(quickRange(k))} className="border rounded-lg px-3 py-1.5">
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setRange([e.target.value, to])}
            className="border rounded-lg px-2 py-1.5 flex-1 min-w-0"
          />
          <span>থেকে</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setRange([from, e.target.value])}
            className="border rounded-lg px-2 py-1.5 flex-1 min-w-0"
          />
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-4">
        <div className="text-xs text-slate-500">মোট খরচ</div>
        <div className="text-2xl font-bold text-red-600">{money(total)}</div>
        {byCat.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {byCat.map(([k, v]) => (
              <div key={k} className="text-sm">
                <div className="flex justify-between">
                  <span>{k}</span>
                  <span>{money(v)}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded">
                  <div className="h-1.5 bg-red-400 rounded" style={{ width: `${(v / total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading ? (
        <p className="text-slate-500">লোড হচ্ছে...</p>
      ) : rows.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">এই সময়ে কোনো খরচ নেই।</div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {rows.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.title}</div>
                <div className="text-xs text-slate-500">
                  {r.expense_date} • {r.category || 'অন্যান্য'}
                </div>
              </div>
              <div className="font-bold text-red-600">{money(r.amount)}</div>
              <button onClick={() => remove(r)} className="text-xs text-red-500">
                মুছুন
              </button>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center">
          <form
            onSubmit={save}
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 space-y-3"
          >
            <h2 className="font-bold">নতুন খরচ</h2>
            <input
              autoFocus
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="কিসের খরচ? (যেমন: দোকান ভাড়া)"
              className="w-full border rounded-lg px-3 py-2"
            />
            <div className="flex flex-wrap gap-2">
              {CATS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, category: c })}
                  className={`border rounded-full px-3 py-1 text-sm ${
                    form.category === c ? 'bg-emerald-600 text-white border-emerald-600' : ''
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="টাকা (৳) *"
                className="border rounded-lg px-3 py-2"
              />
              <input
                type="date"
                value={form.date}
                max={todayStr()}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="border rounded-lg px-2 py-2"
              />
            </div>
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
