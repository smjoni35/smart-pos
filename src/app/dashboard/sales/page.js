'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Receipt from '../Receipt';

const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const METHOD = { cash: 'নগদ', card: 'কার্ড', mobile: 'মোবাইল', due: 'বাকি' };

const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
function addDays(str, n) {
  const d = new Date(str + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function SalesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState(null);
  const [shop, setShop] = useState(null);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [sales, setSales] = useState([]);
  const [custMap, setCustMap] = useState({});
  const [profitMap, setProfitMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  const canSeeProfit = !!ctx && ['owner', 'manager'].includes(ctx.role);

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

    const start = `${from}T00:00:00+06:00`;
    const end = `${to}T23:59:59.999+06:00`;
    const isMgr = ['owner', 'manager'].includes(prof.role);

    const [s, c, sh, pr] = await Promise.all([
      supabase
        .from('pos_sales')
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('customers').select('id, name, phone'),
      supabase.from('shops').select('*').eq('id', prof.shop_id).maybeSingle(),
      isMgr
        ? supabase.from('sales').select('id, profit').gte('created_at', start).lte('created_at', end).limit(500)
        : Promise.resolve({ data: [] }),
    ]);
    if (s.error) setError('বিক্রির তালিকা লোড হয়নি: ' + s.error.message);
    setSales(s.data ?? []);
    setCustMap(Object.fromEntries((c.data ?? []).map((x) => [x.id, x])));
    setProfitMap(Object.fromEntries((pr.data ?? []).map((x) => [x.id, Number(x.profit)])));
    setShop(sh.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const totals = sales.reduce(
    (a, s) => ({
      count: a.count + 1,
      total: a.total + Number(s.total),
      paid: a.paid + Number(s.paid),
      due: a.due + Number(s.due),
      profit: a.profit + (profitMap[s.id] || 0),
    }),
    { count: 0, total: 0, paid: 0, due: 0, profit: 0 }
  );

  function quick(kind) {
    const t = todayStr();
    if (kind === 'today') {
      setFrom(t);
      setTo(t);
    } else if (kind === 'week') {
      setFrom(addDays(t, -6));
      setTo(t);
    } else {
      setFrom(t.slice(0, 8) + '01');
      setTo(t);
    }
  }

  async function openReceipt(sale) {
    const { data } = await supabase.from('pos_sale_items').select('*').eq('sale_id', sale.id);
    setReceipt({ sale, items: data ?? [], customer: custMap[sale.customer_id], shop });
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">📜 বিক্রির তালিকা</h1>

      <div className="bg-white border rounded-xl p-3 mb-4">
        <div className="flex gap-2 mb-2 text-sm">
          <button onClick={() => quick('today')} className="border rounded-lg px-3 py-1.5">
            আজ
          </button>
          <button onClick={() => quick('week')} className="border rounded-lg px-3 py-1.5">
            গত ৭ দিন
          </button>
          <button onClick={() => quick('month')} className="border rounded-lg px-3 py-1.5">
            এই মাস
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded-lg px-2 py-1.5 flex-1 min-w-0"
          />
          <span>থেকে</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded-lg px-2 py-1.5 flex-1 min-w-0"
          />
        </div>
      </div>

      <div className={`grid gap-2 mb-4 ${canSeeProfit ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'}`}>
        <div className="bg-white border rounded-xl p-3">
          <div className="text-xs text-slate-500">মোট ইনভয়েস</div>
          <div className="text-lg font-bold">{totals.count}</div>
        </div>
        <div className="bg-white border rounded-xl p-3">
          <div className="text-xs text-slate-500">মোট বিক্রি</div>
          <div className="text-lg font-bold">{money(totals.total)}</div>
        </div>
        <div className="bg-white border rounded-xl p-3">
          <div className="text-xs text-slate-500">নগদ আদায়</div>
          <div className="text-lg font-bold text-emerald-700">{money(totals.paid)}</div>
        </div>
        <div className="bg-white border rounded-xl p-3">
          <div className="text-xs text-slate-500">বাকি পড়েছে</div>
          <div className="text-lg font-bold text-amber-600">{money(totals.due)}</div>
        </div>
        {canSeeProfit && (
          <div className="bg-white border rounded-xl p-3 col-span-2 md:col-span-1">
            <div className="text-xs text-slate-500">মোট লাভ</div>
            <div className={`text-lg font-bold ${totals.profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
              {money(totals.profit)}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {loading ? (
        <p className="text-slate-500">লোড হচ্ছে...</p>
      ) : sales.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">
          এই সময়ে কোনো বিক্রি নেই।
        </div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {sales.map((s) => (
            <button
              key={s.id}
              onClick={() => openReceipt(s)}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{s.invoice_no}</div>
                <div className="text-xs text-slate-500 truncate">
                  {new Date(s.created_at).toLocaleString('en-GB', {
                    timeZone: 'Asia/Dhaka',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {' • '}
                  {custMap[s.customer_id]?.name || 'খুচরা'}
                  {' • '}
                  {METHOD[s.payment_method]}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold">{money(s.total)}</div>
                {Number(s.due) > 0 && <div className="text-xs text-amber-600">বাকি {money(s.due)}</div>}
                {canSeeProfit && profitMap[s.id] != null && (
                  <div className={`text-xs ${profitMap[s.id] < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    লাভ {money(profitMap[s.id])}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {receipt && <Receipt data={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
