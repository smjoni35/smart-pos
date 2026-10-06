'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { todayStr, rangeISO } from '@/lib/dates';

const money = (n) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

function Card({ title, value, sub, href, tone = '' }) {
  const body = (
    <div className={`bg-white border rounded-xl p-4 h-full ${href ? 'hover:border-emerald-500' : ''}`}>
      <div className="text-xs text-slate-500">{title}</div>
      <div className={`text-xl font-bold mt-1 ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function Summary({ role }) {
  const supabase = useMemo(() => createClient(), []);
  const isMgr = ['owner', 'manager'].includes(role);
  const [d, setD] = useState(null);
  const [own, setOwn] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (isMgr) {
        const { data, error } = await supabase.rpc('dashboard_summary');
        if (error) return setError('সারাংশ লোড হয়নি (step6_migration.sql রান করেছেন কি?)');
        setD(data?.[0] ?? null);
      } else if (role === 'cashier') {
        const t = todayStr();
        const { start, end } = rangeISO(t, t);
        const { data } = await supabase
          .from('pos_sales')
          .select('total, paid, due')
          .gte('created_at', start)
          .lte('created_at', end);
        const rows = data ?? [];
        setOwn({
          count: rows.length,
          total: rows.reduce((a, r) => a + Number(r.total), 0),
          paid: rows.reduce((a, r) => a + Number(r.paid), 0),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <p className="text-sm text-amber-700 mb-4">{error}</p>;

  if (role === 'cashier') {
    if (!own) return null;
    return (
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card title="আজ আমার ইনভয়েস" value={own.count} />
        <Card title="আজ আমার বিক্রি" value={money(own.total)} />
        <Card title="আজ আদায়" value={money(own.paid)} tone="text-emerald-700" />
      </div>
    );
  }

  if (!isMgr) return null;
  if (!d) return <p className="text-sm text-slate-500 mb-4">সারাংশ লোড হচ্ছে...</p>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <Card title="আজকের বিক্রি" value={money(d.today_sales)} sub={`${d.today_count}টি ইনভয়েস`} href="/dashboard/sales" />
      <Card
        title="আজকের লাভ"
        value={money(d.today_profit)}
        tone={Number(d.today_profit) < 0 ? 'text-red-600' : 'text-emerald-700'}
        sub="মালের খরচ বাদে"
      />
      <Card
        title="এই মাসের বিক্রি"
        value={money(d.month_sales)}
        sub={`লাভ ${money(d.month_profit)}`}
        href="/dashboard/reports"
      />
      <Card title="স্টক মূল্য" value={money(d.stock_value)} sub="কেনা দামে" href="/dashboard/products" />
      <Card
        title="কাস্টমারের কাছে পাওনা"
        value={money(d.cust_due)}
        tone="text-amber-600"
        href="/dashboard/customers"
      />
      <Card title="সাপ্লায়ারের দেনা" value={money(d.supplier_due)} tone="text-red-600" href="/dashboard/suppliers" />
      <Card
        title="কম স্টক"
        value={`${d.low_stock_count}টি`}
        tone={Number(d.low_stock_count) > 0 ? 'text-amber-600' : ''}
        href="/dashboard/products"
      />
      <Card
        title="স্টক শেষ"
        value={`${d.out_stock_count}টি`}
        tone={Number(d.out_stock_count) > 0 ? 'text-red-600' : ''}
        href="/dashboard/products"
      />
    </div>
  );
}
