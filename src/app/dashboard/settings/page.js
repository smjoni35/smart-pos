'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const TYPES = [
  ['grocery', 'মুদি দোকান'],
  ['supershop', 'সুপারশপ'],
  ['library', 'লাইব্রেরি / বই-খাতা'],
  ['pharmacy', 'ফার্মেসি'],
  ['electronics', 'ইলেকট্রনিক্স'],
  ['clothing', 'কাপড় / জুতা'],
  ['general', 'অন্যান্য'],
];
const STATUS = {
  active: ['সক্রিয়', 'bg-emerald-100 text-emerald-800'],
  pending: ['অনুমোদনের অপেক্ষায়', 'bg-amber-100 text-amber-800'],
  suspended: ['স্থগিত', 'bg-red-100 text-red-700'],
};

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState(null);
  const [shop, setShop] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [pw, setPw] = useState({ a: '', b: '' });
  const [pwMsg, setPwMsg] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  function flash(msg) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  }

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('role, shop_id').eq('id', user.id).maybeSingle();
    setRole(prof?.role || null);
    if (prof?.role !== 'owner') {
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.from('shops').select('*').eq('id', prof.shop_id).maybeSingle();
    if (error || !data) {
      setError('দোকানের তথ্য লোড হয়নি');
      setLoading(false);
      return;
    }
    setShop(data);
    setForm({
      name: data.name || '',
      business_type: data.business_type || 'general',
      phone: data.phone || '',
      address: data.address || '',
      receipt_footer: data.receipt_footer || '',
      allow_negative_stock: !!data.allow_negative_stock,
    });
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('দোকানের নাম দিন');
    setSaving(true);
    const { error } = await supabase
      .from('shops')
      .update({
        name: form.name.trim(),
        business_type: form.business_type,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        receipt_footer: form.receipt_footer.trim() || null,
        allow_negative_stock: form.allow_negative_stock,
      })
      .eq('id', shop.id);
    setSaving(false);
    if (error) {
      return setError(
        /receipt_footer/.test(error.message)
          ? 'step7_migration.sql রান করা হয়নি'
          : 'সেভ করা যায়নি: ' + error.message
      );
    }
    flash('সেটিংস সেভ হয়েছে ✓');
    load();
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMsg('');
    if (pw.a.length < 6) return setPwMsg('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
    if (pw.a !== pw.b) return setPwMsg('দুটি পাসওয়ার্ড মিলছে না');
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setPwBusy(false);
    if (error) return setPwMsg('বদলানো যায়নি: ' + error.message);
    setPw({ a: '', b: '' });
    flash('পাসওয়ার্ড বদলানো হয়েছে ✓');
  }

  if (loading) return <p className="text-slate-500">লোড হচ্ছে...</p>;
  if (role !== 'owner') {
    return <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">এই পেজ শুধু দোকানের মালিকের জন্য।</p>;
  }

  const trialEnd = shop?.trial_ends_at ? new Date(shop.trial_ends_at) : null;
  const daysLeft = trialEnd ? Math.ceil((trialEnd - new Date()) / 86400000) : null;
  const [statusLabel, statusClass] = STATUS[shop.status] || [shop.status, 'bg-slate-100'];

  return (
    <div className="max-w-xl">
      {notice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-800 text-white text-sm rounded-lg px-4 py-2 shadow">
          {notice}
        </div>
      )}
      <h1 className="text-xl font-bold mb-4">⚙️ দোকানের সেটিংস</h1>

      <div className="bg-white border rounded-xl p-4 mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">অ্যাকাউন্টের অবস্থা</div>
          <span className={`inline-block text-sm rounded-full px-3 py-1 mt-1 ${statusClass}`}>{statusLabel}</span>
        </div>
        {trialEnd && (
          <div className="text-right text-sm">
            <div className="text-xs text-slate-500">ট্রায়াল শেষ</div>
            <div className="font-medium">
              {trialEnd.toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium' })}
            </div>
            <div className={`text-xs ${daysLeft <= 7 ? 'text-red-600' : 'text-slate-500'}`}>
              {daysLeft > 0 ? `আর ${daysLeft} দিন` : 'মেয়াদ শেষ'}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={save} className="bg-white border rounded-xl p-4 space-y-3 mb-4">
        <h2 className="font-semibold">দোকানের তথ্য</h2>
        <div>
          <label className="block text-sm mb-1">দোকানের নাম *</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">ব্যবসার ধরন</label>
          <select
            value={form.business_type}
            onChange={(e) => setForm({ ...form, business_type: e.target.value })}
            className="w-full border rounded-lg px-2 py-2 bg-white"
          >
            {TYPES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">ফোন নম্বর</label>
          <input
            value={form.phone}
            inputMode="tel"
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">ঠিকানা</label>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">রসিদের নিচের বার্তা</label>
          <input
            value={form.receipt_footer}
            onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
            placeholder="ধন্যবাদ! আবার আসবেন।"
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        <label className="flex items-start gap-3 pt-1">
          <input
            type="checkbox"
            checked={form.allow_negative_stock}
            onChange={(e) => setForm({ ...form, allow_negative_stock: e.target.checked })}
            className="mt-1 w-4 h-4"
          />
          <span className="text-sm">
            স্টক শূন্য হলেও বিক্রি করতে দিন
            <span className="block text-xs text-slate-500">
              চালু থাকলে স্টকে না থাকা পণ্যও বিক্রি করা যাবে (স্টক মাইনাসে যাবে)। যাদের স্টকের হিসাব এখনো পুরো মেলানো হয়নি তাদের জন্য সুবিধাজনক।
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 font-medium disabled:opacity-60"
        >
          {saving ? 'সেভ হচ্ছে...' : 'সেভ করুন'}
        </button>
      </form>

      <form onSubmit={changePassword} className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">আমার পাসওয়ার্ড বদলান</h2>
        <input
          type="password"
          value={pw.a}
          onChange={(e) => setPw({ ...pw, a: e.target.value })}
          placeholder="নতুন পাসওয়ার্ড"
          className="w-full border rounded-lg px-3 py-2"
        />
        <input
          type="password"
          value={pw.b}
          onChange={(e) => setPw({ ...pw, b: e.target.value })}
          placeholder="আবার লিখুন"
          className="w-full border rounded-lg px-3 py-2"
        />
        {pwMsg && <p className="text-sm text-red-600">{pwMsg}</p>}
        <button disabled={pwBusy} className="w-full border rounded-lg py-2.5 font-medium disabled:opacity-60">
          {pwBusy ? 'বদলানো হচ্ছে...' : 'পাসওয়ার্ড বদলান'}
        </button>
      </form>
    </div>
  );
}
