'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const ROLE = { owner: 'মালিক', manager: 'ম্যানেজার', cashier: 'ক্যাশিয়ার' };
const ROLE_HINT = {
  manager: 'পণ্য, স্টক, মাল কেনা, খরচ ও রিপোর্ট দেখতে পারবে (নিট লাভ ছাড়া)',
  cashier: 'শুধু বিক্রি করা, কাস্টমার ও বাকি আদায় করতে পারবে',
};

export default function StaffPage() {
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState(null);
  const [staff, setStaff] = useState([]);
  const [me, setMe] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function flash(msg) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  }

  async function load() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    setRole(prof?.role || null);
    if (prof?.role !== 'owner') {
      setLoading(false);
      return;
    }
    const res = await fetch('/api/staff');
    const json = await res.json();
    if (!res.ok) setError(json.error || 'স্টাফ তালিকা লোড হয়নি');
    else {
      setStaff(json.staff);
      setMe(json.me);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function call(method, body) {
    const res = await fetch('/api/staff', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, error: json.error };
  }

  async function addStaff(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    const r = await call('POST', form);
    setSaving(false);
    if (!r.ok) return setFormError(r.error || 'তৈরি করা যায়নি');
    setForm(null);
    flash('নতুন স্টাফ যোগ হয়েছে ✓');
    load();
  }

  async function changeRole(s, newRole) {
    const r = await call('PATCH', { id: s.id, role: newRole });
    if (!r.ok) return alert(r.error || 'বদলানো যায়নি');
    flash('রোল বদলানো হয়েছে ✓');
    load();
  }

  async function toggleActive(s) {
    const next = !s.is_active;
    const msg = next
      ? `"${s.full_name}" কে আবার চালু করবেন?`
      : `"${s.full_name}" কে বন্ধ করবেন? সে আর লগইন করে কাজ করতে পারবে না (আগের হিসাব থেকে যাবে)।`;
    if (!confirm(msg)) return;
    const r = await call('PATCH', { id: s.id, is_active: next });
    if (!r.ok) return alert(r.error || 'বদলানো যায়নি');
    flash(next ? 'চালু করা হয়েছে ✓' : 'বন্ধ করা হয়েছে ✓');
    load();
  }

  async function resetPassword(s) {
    const pw = prompt(`"${s.full_name}" এর নতুন পাসওয়ার্ড দিন (কমপক্ষে ৬ অক্ষর)`);
    if (pw == null) return;
    if (pw.length < 6) return alert('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
    const r = await call('PATCH', { id: s.id, password: pw });
    if (!r.ok) return alert(r.error || 'বদলানো যায়নি');
    flash('পাসওয়ার্ড বদলানো হয়েছে ✓');
  }

  async function rename(s) {
    const n = prompt('নতুন নাম', s.full_name);
    if (!n || !n.trim() || n.trim() === s.full_name) return;
    const r = await call('PATCH', { id: s.id, full_name: n.trim() });
    if (!r.ok) return alert(r.error || 'বদলানো যায়নি');
    load();
  }

  if (loading) return <p className="text-slate-500">লোড হচ্ছে...</p>;
  if (role !== 'owner') {
    return <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">এই পেজ শুধু দোকানের মালিকের জন্য।</p>;
  }

  return (
    <div>
      {notice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-800 text-white text-sm rounded-lg px-4 py-2 shadow">
          {notice}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">👨‍💼 স্টাফ</h1>
        <button
          onClick={() => {
            setFormError('');
            setForm({ full_name: '', email: '', password: '', role: 'cashier' });
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          + নতুন স্টাফ
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <div className="bg-white border rounded-xl divide-y">
        {staff.map((s) => {
          const isMe = s.id === me;
          const locked = isMe || s.role === 'owner';
          return (
            <div key={s.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {s.full_name} {isMe && <span className="text-xs text-slate-400">(আপনি)</span>}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{s.email}</div>
                </div>
                <span
                  className={`text-xs rounded-full px-2 py-1 ${
                    s.role === 'owner' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {ROLE[s.role]}
                </span>
                {!s.is_active && <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-1">বন্ধ</span>}
              </div>

              {!locked && (
                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  <select
                    value={s.role}
                    onChange={(e) => changeRole(s, e.target.value)}
                    className="border rounded-lg px-2 py-1 bg-white"
                  >
                    <option value="manager">ম্যানেজার</option>
                    <option value="cashier">ক্যাশিয়ার</option>
                  </select>
                  <button onClick={() => rename(s)} className="border rounded-lg px-2 py-1">
                    নাম বদলান
                  </button>
                  <button onClick={() => resetPassword(s)} className="border rounded-lg px-2 py-1">
                    🔑 পাসওয়ার্ড রিসেট
                  </button>
                  <button
                    onClick={() => toggleActive(s)}
                    className={`border rounded-lg px-2 py-1 ${s.is_active ? 'text-red-600 border-red-200' : 'text-emerald-700'}`}
                  >
                    {s.is_active ? 'বন্ধ করুন' : 'চালু করুন'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center">
          <form
            onSubmit={addStaff}
            className="bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto"
          >
            <h2 className="font-bold">নতুন স্টাফ</h2>
            <input
              autoFocus
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="নাম *"
              className="w-full border rounded-lg px-3 py-2"
            />
            <div>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ইমেইল (লগইনের জন্য) *"
                className="w-full border rounded-lg px-3 py-2"
              />
              <p className="text-xs text-slate-500 mt-1">
                আসল ইমেইল না থাকলে যেকোনো ইমেইলের মতো দিতে পারেন (যেমন rahim@myshop.com), কোনো কনফার্মেশন লাগবে না।
              </p>
            </div>
            <input
              type="text"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর) *"
              className="w-full border rounded-lg px-3 py-2"
            />
            <div>
              <div className="flex gap-2">
                {['cashier', 'manager'].map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setForm({ ...form, role: r })}
                    className={`flex-1 border rounded-lg py-2 text-sm ${
                      form.role === r ? 'bg-emerald-600 text-white border-emerald-600' : ''
                    }`}
                  >
                    {ROLE[r]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">{ROLE_HINT[form.role]}</p>
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
                {saving ? 'তৈরি হচ্ছে...' : 'স্টাফ যোগ করুন'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
