'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtDate = (d) =>
  new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium' });

const TYPE = {
  grocery: 'মুদি দোকান',
  supershop: 'সুপারশপ',
  library: 'লাইব্রেরি',
  pharmacy: 'ফার্মেসি',
  electronics: 'ইলেকট্রনিক্স',
  clothing: 'কাপড়/জুতা',
  general: 'অন্যান্য',
};

// দোকানের বর্তমান অবস্থা (status + ট্রায়াল মিলিয়ে)
function health(s) {
  const days = s.trial_ends_at ? Math.ceil((new Date(s.trial_ends_at) - new Date()) / 86400000) : null;
  if (s.status === 'suspended') return { key: 'suspended', label: 'স্থগিত', cls: 'bg-red-100 text-red-700', days };
  if (s.status === 'pending') return { key: 'pending', label: 'অপেক্ষায়', cls: 'bg-amber-100 text-amber-800', days };
  if (days !== null && days <= 0) return { key: 'expired', label: 'মেয়াদ শেষ', cls: 'bg-red-100 text-red-700', days };
  if (days !== null && days <= 7) return { key: 'expiring', label: 'শেষ হচ্ছে', cls: 'bg-amber-100 text-amber-800', days };
  if (days === null) return { key: 'active', label: 'স্থায়ী', cls: 'bg-emerald-100 text-emerald-800', days };
  return { key: 'active', label: 'সক্রিয়', cls: 'bg-emerald-100 text-emerald-800', days };
}

function actionLabel(a, detail) {
  if (a === 'status:active') return '✅ চালু / অনুমোদন';
  if (a === 'status:suspended') return '⏸️ সাসপেন্ড' + (detail ? ` (${detail})` : '');
  if (a === 'status:pending') return '🕒 অপেক্ষায় রাখা';
  if (a === 'trial:unlimited') return '♾️ স্থায়ী করা হয়েছে';
  if (a.startsWith('trial:+')) return `📅 ট্রায়াল ${a.slice(6)} দিন বাড়ানো`;
  return a;
}

const FILTERS = [
  ['all', 'সব'],
  ['active', 'সক্রিয়'],
  ['pending', 'অপেক্ষায়'],
  ['expiring', 'শেষ হচ্ছে'],
  ['expired', 'মেয়াদ শেষ'],
  ['suspended', 'স্থগিত'],
];

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState(null);
  const [shops, setShops] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('shops');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [detail, setDetail] = useState(null);

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
    if (prof?.role !== 'super_admin') {
      setLoading(false);
      return [];
    }
    const [o, l] = await Promise.all([
      supabase.rpc('admin_shop_overview'),
      supabase.from('admin_audit_log').select('*').order('created_at', { ascending: false }).limit(60),
    ]);
    if (o.error) setError('দোকানের তালিকা লোড হয়নি (step8_migration.sql রান করেছেন কি?): ' + o.error.message);
    setShops(o.data ?? []);
    setLogs(l.data ?? []);
    setLoading(false);
    return o.data ?? [];
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh(id) {
    const list = await load();
    const fresh = list.find((s) => s.shop_id === id);
    if (fresh) setDetail(fresh);
  }

  async function setStatus(s, status) {
    const label = { active: 'চালু (অনুমোদন)', suspended: 'সাসপেন্ড', pending: 'অপেক্ষায় রাখা' }[status];
    let note = null;
    if (status === 'suspended') {
      note = prompt(`"${s.name}" সাসপেন্ড করছেন। কারণ লিখুন (ঐচ্ছিক):`);
      if (note === null) return;
    } else if (!confirm(`"${s.name}" কে ${label} করবেন?`)) return;

    const { error } = await supabase.rpc('admin_set_shop_status', {
      p_shop_id: s.shop_id,
      p_status: status,
      p_note: note?.trim() || null,
    });
    if (error) return alert('হয়নি: ' + error.message);
    flash('আপডেট হয়েছে ✓');
    refresh(s.shop_id);
  }

  async function setTrial(s, days) {
    const msg =
      days == null
        ? `"${s.name}" কে স্থায়ী (ট্রায়াল ছাড়া) করবেন?`
        : `"${s.name}" এর ট্রায়াল ${days} দিন বাড়াবেন?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.rpc('admin_set_trial', { p_shop_id: s.shop_id, p_days: days });
    if (error) return alert('হয়নি: ' + error.message);
    flash('ট্রায়াল আপডেট হয়েছে ✓');
    refresh(s.shop_id);
  }

  const enriched = useMemo(() => shops.map((s) => ({ ...s, h: health(s) })), [shops]);

  const counts = useMemo(() => {
    const c = { total: enriched.length, active: 0, pending: 0, suspended: 0, expiring: 0, expired: 0 };
    enriched.forEach((s) => {
      if (c[s.h.key] !== undefined) c[s.h.key]++;
    });
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return enriched.filter((s) => {
      if (filter === 'active' && !(s.h.key === 'active' || s.h.key === 'expiring')) return false;
      if (['pending', 'expiring', 'expired', 'suspended'].includes(filter) && s.h.key !== filter) return false;
      if (!t) return true;
      return (
        s.name.toLowerCase().includes(t) ||
        (s.owner_name || '').toLowerCase().includes(t) ||
        (s.owner_email || '').toLowerCase().includes(t) ||
        (s.phone || '').includes(t)
      );
    });
  }, [enriched, q, filter]);

  if (loading) return <p className="text-slate-500">লোড হচ্ছে...</p>;
  if (role !== 'super_admin') {
    return <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">এই পেজ শুধু সুপার অ্যাডমিনের জন্য।</p>;
  }

  const totalSales = shops.reduce((a, s) => a + Number(s.sales_total), 0);

  return (
    <div>
      {notice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-800 text-white text-sm rounded-lg px-4 py-2 shadow">
          {notice}
        </div>
      )}
      <h1 className="text-xl font-bold mb-4">🛡️ সব দোকান</h1>

      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        {[
          ['মোট দোকান', counts.total, ''],
          ['সক্রিয়', counts.active + counts.expiring, 'text-emerald-700'],
          ['অপেক্ষায়', counts.pending, 'text-amber-600'],
          ['শেষ হচ্ছে', counts.expiring, 'text-amber-600'],
          ['মেয়াদ শেষ', counts.expired, 'text-red-600'],
          ['স্থগিত', counts.suspended, 'text-red-600'],
        ].map(([t, v, tone]) => (
          <div key={t} className="bg-white border rounded-xl p-3">
            <div className="text-xs text-slate-500">{t}</div>
            <div className={`text-lg font-bold ${tone}`}>{v}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 mb-4">সব দোকান মিলিয়ে মোট বিক্রি: {money(totalSales)}</p>

      <div className="flex gap-2 mb-4 text-sm">
        <button
          onClick={() => setTab('shops')}
          className={`px-4 py-1.5 rounded-lg border ${tab === 'shops' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white'}`}
        >
          দোকান
        </button>
        <button
          onClick={() => setTab('log')}
          className={`px-4 py-1.5 rounded-lg border ${tab === 'log' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white'}`}
        >
          কার্যক্রম লগ
        </button>
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {tab === 'shops' ? (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="দোকান, মালিক, ইমেইল বা ফোন দিয়ে খুঁজুন"
            className="w-full border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
          />
          <div className="flex gap-2 overflow-x-auto mb-4 pb-1">
            {FILTERS.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`whitespace-nowrap border rounded-full px-3 py-1 text-sm ${
                  filter === k ? 'bg-slate-800 text-white border-slate-800' : 'bg-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center text-slate-500">কোনো দোকান পাওয়া যায়নি।</div>
          ) : (
            <div className="bg-white border rounded-xl divide-y">
              {filtered.map((s) => (
                <button
                  key={s.shop_id}
                  onClick={() => setDetail(s)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {s.owner_name || 'মালিক নেই'} • {TYPE[s.business_type] || s.business_type}
                    </div>
                    <div className="text-xs text-slate-400">
                      {s.last_sale_at ? `শেষ বিক্রি ${fmtDay(s.last_sale_at)}` : 'এখনো বিক্রি নেই'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs rounded-full px-2 py-1 ${s.h.cls}`}>{s.h.label}</span>
                    {s.h.days !== null && s.h.key !== 'suspended' && s.h.key !== 'pending' && (
                      <div className={`text-xs mt-1 ${s.h.days <= 7 ? 'text-red-600' : 'text-slate-500'}`}>
                        {s.h.days > 0 ? `${s.h.days} দিন বাকি` : 'মেয়াদ শেষ'}
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-1">{money(s.sales_total)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      ) : logs.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">এখনো কোনো কার্যক্রম নেই।</div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {logs.map((l) => (
            <div key={l.id} className="px-4 py-3">
              <div className="text-sm font-medium">{actionLabel(l.action, l.detail)}</div>
              <div className="text-xs text-slate-500">
                {l.shop_name || 'মুছে ফেলা দোকান'} • {fmtDate(l.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- দোকানের বিস্তারিত ---------- */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold">{detail.name}</h2>
                <div className="text-sm text-slate-500">{TYPE[detail.business_type] || detail.business_type}</div>
              </div>
              <button onClick={() => setDetail(null)} className="text-2xl leading-none text-slate-400">
                ×
              </button>
            </div>

            {(() => {
              const h = health(detail);
              return (
                <div className="mt-3 flex items-center gap-2">
                  <span className={`text-sm rounded-full px-3 py-1 ${h.cls}`}>{h.label}</span>
                  <span className="text-sm text-slate-600">
                    {detail.trial_ends_at
                      ? `ট্রায়াল শেষ: ${fmtDay(detail.trial_ends_at)}${h.days > 0 ? ` (${h.days} দিন)` : ''}`
                      : 'ট্রায়াল নেই (স্থায়ী)'}
                  </span>
                </div>
              );
            })()}

            <div className="mt-4 text-sm space-y-1.5">
              <div>
                <span className="text-slate-500">মালিক:</span> {detail.owner_name || '—'}
              </div>
              <div>
                <span className="text-slate-500">ইমেইল:</span>{' '}
                {detail.owner_email ? (
                  <a href={`mailto:${detail.owner_email}`} className="text-emerald-700">
                    {detail.owner_email}
                  </a>
                ) : (
                  '—'
                )}
              </div>
              <div>
                <span className="text-slate-500">ফোন:</span>{' '}
                {detail.phone ? (
                  <a href={`tel:${detail.phone}`} className="text-emerald-700">
                    {detail.phone}
                  </a>
                ) : (
                  '—'
                )}
              </div>
              <div>
                <span className="text-slate-500">ঠিকানা:</span> {detail.address || '—'}
              </div>
              <div>
                <span className="text-slate-500">খোলা হয়েছে:</span> {fmtDay(detail.created_at)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              {[
                ['স্টাফ/ইউজার', detail.staff_count],
                ['পণ্য', detail.product_count],
                ['কাস্টমার', detail.customer_count],
                ['ইনভয়েস', detail.sale_count],
              ].map(([t, v]) => (
                <div key={t} className="border rounded-lg p-2.5">
                  <div className="text-xs text-slate-500">{t}</div>
                  <div className="font-bold">{Number(v)}</div>
                </div>
              ))}
              <div className="border rounded-lg p-2.5 col-span-2">
                <div className="text-xs text-slate-500">মোট বিক্রি</div>
                <div className="font-bold">{money(detail.sales_total)}</div>
                <div className="text-xs text-slate-500">
                  {detail.last_sale_at ? `শেষ বিক্রি ${fmtDate(detail.last_sale_at)}` : 'এখনো বিক্রি নেই'}
                </div>
              </div>
            </div>

            <h3 className="font-semibold mt-5 mb-2">অবস্থা</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {detail.status !== 'active' && (
                <button
                  onClick={() => setStatus(detail, 'active')}
                  className="bg-emerald-600 text-white rounded-lg py-2.5 font-medium col-span-2"
                >
                  ✅ {detail.status === 'pending' ? 'অনুমোদন দিন' : 'আবার চালু করুন'}
                </button>
              )}
              {detail.status === 'active' && (
                <button
                  onClick={() => setStatus(detail, 'suspended')}
                  className="border border-red-200 text-red-600 rounded-lg py-2.5 col-span-2"
                >
                  ⏸️ সাসপেন্ড করুন
                </button>
              )}
            </div>

            <h3 className="font-semibold mt-5 mb-2">ট্রায়াল / সাবস্ক্রিপশন</h3>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <button onClick={() => setTrial(detail, 30)} className="border rounded-lg py-2">
                +৩০ দিন
              </button>
              <button onClick={() => setTrial(detail, 90)} className="border rounded-lg py-2">
                +৯০ দিন
              </button>
              <button onClick={() => setTrial(detail, 365)} className="border rounded-lg py-2">
                +১ বছর
              </button>
              <button onClick={() => setTrial(detail, null)} className="border rounded-lg py-2 col-span-3">
                ♾️ স্থায়ী করুন (মেয়াদ ছাড়া)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
