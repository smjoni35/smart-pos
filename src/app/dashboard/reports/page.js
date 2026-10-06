'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { addDays, quickRange } from '@/lib/dates';

const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState(null);
  const [[from, to], setRange] = useState(quickRange('month'));
  const [days, setDays] = useState([]);
  const [top, setTop] = useState([]);
  const [pr, setPr] = useState(null); // profit_report (শুধু মালিক)
  const [expCats, setExpCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isOwner = ctx?.role === 'owner';
  const allowed = !!ctx && ['owner', 'manager'].includes(ctx.role);

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
    const owner = prof.role === 'owner';
    const [d, t, p, e] = await Promise.all([
      supabase.rpc('sales_by_day', { p_from: from, p_to: to }),
      supabase.rpc('top_products', { p_from: from, p_to: to, p_limit: 10 }),
      owner ? supabase.rpc('profit_report', { p_from: from, p_to: to }) : Promise.resolve({ data: null }),
      owner
        ? supabase.from('expenses').select('category, amount').gte('expense_date', from).lte('expense_date', to).limit(5000)
        : Promise.resolve({ data: [] }),
    ]);
    if (d.error || t.error) setError('রিপোর্ট লোড হয়নি (step6_migration.sql রান করেছেন কি?)');
    if (p.error) setError('লাভ-ক্ষতি হিসাব আনা যায়নি: ' + p.error.message);
    setDays(d.data ?? []);
    setTop(t.data ?? []);
    setPr(p.data?.[0] ?? null);

    const m = {};
    (e.data ?? []).forEach((r) => {
      const k = r.category || 'অন্যান্য';
      m[k] = (m[k] || 0) + Number(r.amount);
    });
    setExpCats(Object.entries(m).sort((a, b) => b[1] - a[1]));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  // যে দিনে বিক্রি নেই সেগুলোও চার্টে ০ দেখাতে (৬২ দিন পর্যন্ত)
  const chart = useMemo(() => {
    const map = Object.fromEntries(days.map((x) => [x.day, x]));
    const list = [];
    let cur = from;
    let guard = 0;
    while (cur <= to && guard < 62) {
      list.push({
        day: cur,
        total: Number(map[cur]?.sales_total || 0),
        count: Number(map[cur]?.sale_count || 0),
      });
      cur = addDays(cur, 1);
      guard++;
    }
    if (cur <= to) return days.map((x) => ({ day: x.day, total: Number(x.sales_total), count: Number(x.sale_count) }));
    return list;
  }, [days, from, to]);

  const maxDay = Math.max(...chart.map((c) => c.total), 1);

  // সারাংশ: মালিকের জন্য profit_report, ম্যানেজারের জন্য দৈনিক যোগফল থেকে
  const salesTotal = pr ? Number(pr.sales_total) : days.reduce((a, x) => a + Number(x.sales_total), 0);
  const saleCount = pr ? Number(pr.sale_count) : days.reduce((a, x) => a + Number(x.sale_count), 0);
  const gross = pr ? Number(pr.gross_profit) : days.reduce((a, x) => a + Number(x.profit), 0);
  const cogs = salesTotal - gross;
  const expensesTotal = pr ? Number(pr.expenses_total) : 0;
  const lossTotal = pr ? Number(pr.loss_total) : 0;
  const net = pr ? Number(pr.net_profit) : 0;
  const maxTop = Math.max(...top.map((t) => Number(t.revenue)), 1);

  if (ctx && !allowed) {
    return <p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4">এই পেজ শুধু মালিক ও ম্যানেজারের জন্য।</p>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">📊 লাভ-ক্ষতি রিপোর্ট</h1>

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

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading ? (
        <p className="text-slate-500">লোড হচ্ছে...</p>
      ) : (
        <>
          {/* নিট লাভ (শুধু মালিক) */}
          {isOwner && pr && (
            <div
              className={`rounded-xl border p-5 mb-4 text-center ${
                net < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <div className="text-sm text-slate-600">{net < 0 ? 'নিট ক্ষতি' : 'নিট লাভ'}</div>
              <div className={`text-3xl font-bold ${net < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                {money(Math.abs(net))}
              </div>
              <div className="text-xs text-slate-500 mt-1">মোট লাভ − খরচ − নষ্ট মাল</div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            <div className="bg-white border rounded-xl p-3">
              <div className="text-xs text-slate-500">মোট বিক্রি</div>
              <div className="text-lg font-bold">{money(salesTotal)}</div>
              <div className="text-xs text-slate-500">{saleCount}টি ইনভয়েস</div>
            </div>
            <div className="bg-white border rounded-xl p-3">
              <div className="text-xs text-slate-500">মালের খরচ (কেনা দামে)</div>
              <div className="text-lg font-bold">{money(cogs)}</div>
            </div>
            <div className="bg-white border rounded-xl p-3 col-span-2 md:col-span-1">
              <div className="text-xs text-slate-500">মোট লাভ (খরচের আগে)</div>
              <div className={`text-lg font-bold ${gross < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(gross)}</div>
            </div>
            {isOwner && pr && (
              <>
                <div className="bg-white border rounded-xl p-3">
                  <div className="text-xs text-slate-500">দোকানের খরচ</div>
                  <div className="text-lg font-bold text-red-600">{money(expensesTotal)}</div>
                </div>
                <div className="bg-white border rounded-xl p-3">
                  <div className="text-xs text-slate-500">নষ্ট মালের ক্ষতি</div>
                  <div className="text-lg font-bold text-red-600">{money(lossTotal)}</div>
                </div>
              </>
            )}
          </div>

          {/* দৈনিক বিক্রি চার্ট */}
          <div className="bg-white border rounded-xl p-4 mb-4">
            <h2 className="font-semibold mb-3">দিন অনুযায়ী বিক্রি</h2>
            {chart.length === 0 || salesTotal === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">এই সময়ে কোনো বিক্রি নেই।</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex items-end gap-1 h-40" style={{ minWidth: chart.length * 18 }}>
                  {chart.map((c) => (
                    <div key={c.day} className="flex-1 flex flex-col justify-end h-full" title={`${c.day}: ${money(c.total)} (${c.count}টি)`}>
                      <div
                        className={`rounded-t ${c.total > 0 ? 'bg-emerald-500' : 'bg-slate-200'}`}
                        style={{ height: `${Math.max((c.total / maxDay) * 100, c.total > 0 ? 3 : 1)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-1 mt-1" style={{ minWidth: chart.length * 18 }}>
                  {chart.map((c) => (
                    <div key={c.day} className="flex-1 text-center text-[10px] text-slate-500">
                      {Number(c.day.slice(8))}
                    </div>
                  ))}
                </div>
                <div className="text-xs text-slate-500 mt-2">সর্বোচ্চ দিন: {money(maxDay)}</div>
              </div>
            )}
          </div>

          {/* সবচেয়ে বেশি বিক্রি হওয়া পণ্য */}
          <div className="bg-white border rounded-xl p-4 mb-4">
            <h2 className="font-semibold mb-3">সবচেয়ে বেশি বিক্রি হওয়া পণ্য</h2>
            {top.length === 0 ? (
              <p className="text-sm text-slate-500">এই সময়ে কোনো বিক্রি নেই।</p>
            ) : (
              <div className="space-y-3">
                {top.map((t, i) => (
                  <div key={t.product_name + i}>
                    <div className="flex justify-between text-sm gap-2">
                      <span className="truncate">
                        {i + 1}. {t.product_name}
                      </span>
                      <span className="whitespace-nowrap font-semibold">{money(t.revenue)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded mt-1">
                      <div
                        className="h-1.5 bg-emerald-500 rounded"
                        style={{ width: `${(Number(t.revenue) / maxTop) * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      বিক্রি {Number(t.qty_sold)} • লাভ {money(t.profit)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* খরচের ভাগ (শুধু মালিক) */}
          {isOwner && expCats.length > 0 && (
            <div className="bg-white border rounded-xl p-4 mb-4">
              <h2 className="font-semibold mb-3">খরচের ভাগ</h2>
              <div className="space-y-1.5">
                {expCats.map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm">
                    <span>{k}</span>
                    <span>{money(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
