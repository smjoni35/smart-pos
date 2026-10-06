'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));
const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d) =>
  new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
const METHOD = { cash: 'নগদ', card: 'কার্ড', mobile: 'মোবাইল', due: 'বাকি' };
const EMPTY = { id: null, name: '', phone: '', address: '', opening: '' };

export default function CustomersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState(null);
  const [shopName, setShopName] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [dueOnly, setDueOnly] = useState(false);

  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [pay, setPay] = useState(null);
  const [payError, setPayError] = useState('');
  const [payBusy, setPayBusy] = useState(false);

  const canManage = !!ctx && ['owner', 'manager'].includes(ctx.role);

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
      return [];
    }
    setCtx({ role: prof.role, shopId: prof.shop_id });
    const [c, s] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('shops').select('name').eq('id', prof.shop_id).maybeSingle(),
    ]);
    if (c.error) setError('কাস্টমার লোড হয়নি: ' + c.error.message);
    setShopName(s.data?.name || '');
    setCustomers(c.data ?? []);
    setLoading(false);
    return c.data ?? [];
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadLedger(id) {
    setLedgerLoading(true);
    const [s, p, o] = await Promise.all([
      supabase
        .from('pos_sales')
        .select('id, invoice_no, total, paid, due, created_at')
        .eq('customer_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('due_payments')
        .select('id, amount, method, note, created_at')
        .eq('customer_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('opening_balances')
        .select('id, amount, created_at')
        .eq('party_type', 'customer')
        .eq('party_id', id),
    ]);
    const entries = [
      ...(s.data ?? []).map((x) => ({
        key: 's' + x.id,
        kind: 'sale',
        date: x.created_at,
        title: `বিক্রি ${x.invoice_no}`,
        sub: `মোট ${money(x.total)} • পরিশোধ ${money(x.paid)}`,
        amount: Number(x.due),
      })),
      ...(p.data ?? []).map((x) => ({
        key: 'p' + x.id,
        kind: 'pay',
        date: x.created_at,
        title: 'বাকি আদায়',
        sub: METHOD[x.method] + (x.note ? ` • ${x.note}` : ''),
        amount: Number(x.amount),
      })),
      ...(o.data ?? []).map((x) => ({
        key: 'o' + x.id,
        kind: 'open',
        date: x.created_at,
        title: 'পুরনো বাকি (খাতা থেকে)',
        sub: '',
        amount: Number(x.amount),
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));
    setLedger(entries);
    setLedgerLoading(false);
  }

  function openDetail(c) {
    setDetail(c);
    setLedger([]);
    loadLedger(c.id);
  }

  async function refreshDetail(id) {
    const list = await load();
    const fresh = list.find((c) => c.id === id);
    if (fresh) setDetail(fresh);
    loadLedger(id);
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return customers.filter((c) => {
      if (dueOnly && Number(c.due_balance) <= 0) return false;
      if (!s) return true;
      return c.name.toLowerCase().includes(s) || (c.phone || '').includes(s);
    });
  }, [customers, q, dueOnly]);

  const totalDue = customers.reduce((a, c) => a + Number(c.due_balance), 0);
  const dueCount = customers.filter((c) => Number(c.due_balance) > 0).length;

  /* ---------- যোগ / এডিট ---------- */
  async function save(e) {
    e.preventDefault();
    setFormError('');
    const name = form.name.trim();
    if (!name) return setFormError('নাম দিন');
    setSaving(true);
    const payload = { name, phone: form.phone.trim() || null, address: form.address.trim() || null };
    let err = null;
    if (form.id) {
      ({ error: err } = await supabase.from('customers').update(payload).eq('id', form.id));
    } else {
      const { data, error } = await supabase
        .from('customers')
        .insert({ ...payload, shop_id: ctx.shopId })
        .select('id')
        .single();
      err = error;
      const opening = num(form.opening);
      if (!err && canManage && opening > 0) {
        ({ error: err } = await supabase.rpc('add_opening_balance', {
          p_party_type: 'customer',
          p_party_id: data.id,
          p_amount: opening,
          p_note: null,
        }));
      }
    }
    setSaving(false);
    if (err) return setFormError('সেভ করা যায়নি: ' + err.message);
    const editedId = form.id;
    setForm(null);
    if (editedId && detail?.id === editedId) refreshDetail(editedId);
    else load();
  }

  async function remove(c) {
    if (Number(c.due_balance) > 0) {
      return alert('আগে বাকি আদায় করুন। বাকি থাকা কাস্টমার মুছা যাবে না।');
    }
    if (!confirm(`"${c.name}" মুছে ফেলবেন? আগের বিক্রির রসিদ থাকবে, শুধু নাম মুছবে।`)) return;
    const { error } = await supabase.from('customers').delete().eq('id', c.id);
    if (error) return alert('মুছা যায়নি: ' + error.message);
    setDetail(null);
    load();
  }

  async function addOpening(c) {
    const v = prompt('পুরনো বাকির পরিমাণ (৳) — খাতা থেকে যা পাওনা আছে');
    if (v == null) return;
    const amt = num(v);
    if (amt <= 0) return alert('সঠিক পরিমাণ দিন');
    const { error } = await supabase.rpc('add_opening_balance', {
      p_party_type: 'customer',
      p_party_id: c.id,
      p_amount: amt,
      p_note: null,
    });
    if (error) return alert('যোগ করা যায়নি: ' + error.message);
    refreshDetail(c.id);
  }

  /* ---------- বাকি আদায় ---------- */
  async function submitPay(e) {
    e.preventDefault();
    setPayError('');
    const amt = num(pay.amount);
    if (amt <= 0) return setPayError('টাকার পরিমাণ দিন');
    if (amt > Number(detail.due_balance) + 0.001) return setPayError('বাকির চেয়ে বেশি নেওয়া যাবে না');
    setPayBusy(true);
    const { error } = await supabase.rpc('receive_due_payment', {
      p_customer_id: detail.id,
      p_amount: amt,
      p_method: pay.method,
      p_note: pay.note.trim() || null,
    });
    setPayBusy(false);
    if (error) return setPayError('সেভ হয়নি: ' + error.message);
    const id = detail.id;
    setPay(null);
    refreshDetail(id);
  }

  const smsHref = (c) =>
    `sms:${c.phone}?body=${encodeURIComponent(
      `প্রিয় ${c.name}, ${shopName} এ আপনার বাকি ${money(c.due_balance)}। অনুগ্রহ করে পরিশোধ করুন। ধন্যবাদ।`
    )}`;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">👥 কাস্টমার ও বাকির খাতা</h1>
        <button
          onClick={() => {
            setFormError('');
            setForm({ ...EMPTY });
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          + নতুন
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white border rounded-xl p-3">
          <div className="text-xs text-slate-500">মোট কাস্টমার</div>
          <div className="text-lg font-bold">{customers.length}</div>
        </div>
        <button
          onClick={() => setDueOnly(!dueOnly)}
          className={`text-left border rounded-xl p-3 ${dueOnly ? 'bg-amber-50 border-amber-300' : 'bg-white'}`}
        >
          <div className="text-xs text-slate-500">বাকি আছে</div>
          <div className="text-lg font-bold text-amber-600">{dueCount} জন</div>
        </button>
        <div className="bg-white border rounded-xl p-3">
          <div className="text-xs text-slate-500">মোট পাওনা</div>
          <div className="text-lg font-bold text-amber-600">{money(totalDue)}</div>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="নাম বা ফোন নম্বর দিয়ে খুঁজুন"
        className="w-full border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
      />

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading ? (
        <p className="text-slate-500">লোড হচ্ছে...</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">
          {customers.length === 0 ? 'এখনো কোনো কাস্টমার নেই।' : 'কাউকে পাওয়া যায়নি।'}
        </div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => openDetail(c)}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-slate-500">{c.phone || 'ফোন নেই'}</div>
              </div>
              {Number(c.due_balance) > 0 ? (
                <div className="text-right">
                  <div className="text-xs text-slate-500">বাকি</div>
                  <div className="font-bold text-amber-600">{money(c.due_balance)}</div>
                </div>
              ) : (
                <div className="text-xs text-emerald-700">বাকি নেই</div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ---------- বিস্তারিত ---------- */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-20 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold">{detail.name}</h2>
                <div className="text-sm text-slate-500">{detail.phone || 'ফোন নেই'}</div>
                {detail.address && <div className="text-sm text-slate-500">{detail.address}</div>}
              </div>
              <button onClick={() => setDetail(null)} className="text-2xl leading-none text-slate-400">
                ×
              </button>
            </div>

            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <div className="text-xs text-slate-600">বর্তমান বাকি</div>
              <div className="text-2xl font-bold text-amber-700">{money(detail.due_balance)}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
              {Number(detail.due_balance) > 0 && (
                <button
                  onClick={() => {
                    setPayError('');
                    setPay({ amount: String(detail.due_balance), method: 'cash', note: '' });
                  }}
                  className="bg-emerald-600 text-white rounded-lg py-2.5 font-medium col-span-2"
                >
                  💰 বাকি আদায় করুন
                </button>
              )}
              {detail.phone && Number(detail.due_balance) > 0 && (
                <a href={smsHref(detail)} className="border rounded-lg py-2 text-center">
                  ✉️ SMS তাগাদা
                </a>
              )}
              {detail.phone && (
                <a href={`tel:${detail.phone}`} className="border rounded-lg py-2 text-center">
                  📞 কল করুন
                </a>
              )}
              <button
                onClick={() => {
                  setFormError('');
                  setForm({
                    id: detail.id,
                    name: detail.name,
                    phone: detail.phone || '',
                    address: detail.address || '',
                    opening: '',
                  });
                }}
                className="border rounded-lg py-2"
              >
                ✏️ এডিট
              </button>
              {canManage && (
                <button onClick={() => addOpening(detail)} className="border rounded-lg py-2">
                  + পুরনো বাকি
                </button>
              )}
              {canManage && (
                <button onClick={() => remove(detail)} className="border border-red-200 text-red-600 rounded-lg py-2">
                  🗑️ মুছুন
                </button>
              )}
            </div>

            <h3 className="font-semibold mt-5 mb-2">লেনদেনের ইতিহাস</h3>
            {ledgerLoading ? (
              <p className="text-sm text-slate-500">লোড হচ্ছে...</p>
            ) : ledger.length === 0 ? (
              <p className="text-sm text-slate-500">এখনো কোনো লেনদেন নেই।</p>
            ) : (
              <div className="divide-y border rounded-xl">
                {ledger.map((e) => (
                  <div key={e.key} className="px-3 py-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{e.title}</div>
                      <div className="text-xs text-slate-500">
                        {fmtDate(e.date)}
                        {e.sub ? ` • ${e.sub}` : ''}
                      </div>
                    </div>
                    {e.kind === 'pay' ? (
                      <div className="font-semibold text-emerald-700">−{money(e.amount)}</div>
                    ) : e.amount > 0 ? (
                      <div className="font-semibold text-amber-600">+{money(e.amount)}</div>
                    ) : (
                      <div className="text-xs text-slate-400">পরিশোধিত</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- বাকি আদায় ফর্ম ---------- */}
      {pay && detail && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center">
          <form
            onSubmit={submitPay}
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 space-y-3"
          >
            <h2 className="font-bold">বাকি আদায় — {detail.name}</h2>
            <p className="text-sm text-slate-600">বর্তমান বাকি: {money(detail.due_balance)}</p>
            <div>
              <label className="block text-sm mb-1">কত টাকা নিলেন (৳)</label>
              <input
                autoFocus
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={pay.amount}
                onChange={(e) => setPay({ ...pay, amount: e.target.value })}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex gap-2">
              {['cash', 'mobile', 'card'].map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setPay({ ...pay, method: m })}
                  className={`flex-1 border rounded-lg py-1.5 text-sm ${
                    pay.method === m ? 'bg-emerald-600 text-white border-emerald-600' : ''
                  }`}
                >
                  {METHOD[m]}
                </button>
              ))}
            </div>
            <input
              value={pay.note}
              onChange={(e) => setPay({ ...pay, note: e.target.value })}
              placeholder="নোট (ঐচ্ছিক)"
              className="w-full border rounded-lg px-3 py-2"
            />
            {payError && <p className="text-sm text-red-600">{payError}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setPay(null)} className="flex-1 border rounded-lg py-2.5">
                বাতিল
              </button>
              <button
                disabled={payBusy}
                className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-60"
              >
                {payBusy ? 'সেভ হচ্ছে...' : 'আদায় সম্পন্ন'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------- যোগ / এডিট ফর্ম ---------- */}
      {form && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center">
          <form
            onSubmit={save}
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 space-y-3"
          >
            <h2 className="font-bold">{form.id ? 'কাস্টমার এডিট' : 'নতুন কাস্টমার'}</h2>
            <input
              autoFocus
              required
              value={form.name}
              onChange={set('name')}
              placeholder="নাম *"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              value={form.phone}
              onChange={set('phone')}
              placeholder="ফোন নম্বর"
              inputMode="tel"
              className="w-full border rounded-lg px-3 py-2"
            />
            <input
              value={form.address}
              onChange={set('address')}
              placeholder="ঠিকানা"
              className="w-full border rounded-lg px-3 py-2"
            />
            {!form.id && canManage && (
              <div>
                <label className="block text-sm mb-1">পুরনো বাকি (খাতা থেকে, ঐচ্ছিক)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={form.opening}
                  onChange={set('opening')}
                  placeholder="0"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
            )}
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
