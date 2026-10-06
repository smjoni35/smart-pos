import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Summary from './Summary';

// [আইকন, নাম, লিংক]
const MODULES = [
  ['🧾', 'নতুন বিক্রি (POS)', '/dashboard/pos'],
  ['📜', 'বিক্রির তালিকা', '/dashboard/sales'],
  ['📦', 'পণ্য ও স্টক', '/dashboard/products'],
  ['🏷️', 'ক্যাটাগরি', '/dashboard/categories'],
  ['👥', 'কাস্টমার ও বাকি', '/dashboard/customers'],
  ['🛍️', 'মাল কেনা', '/dashboard/purchases'],
  ['🚚', 'সাপ্লায়ার', '/dashboard/suppliers'],
  ['💸', 'খরচ', '/dashboard/expenses'],
  ['🗑️', 'নষ্ট মাল', '/dashboard/adjustments'],
  ['📊', 'লাভ-ক্ষতি রিপোর্ট', '/dashboard/reports'],
  ['👨‍💼', 'স্টাফ', '/dashboard/staff'],
  ['⚙️', 'সেটিংস', '/dashboard/settings'],
];
const OWNER_ONLY = new Set(['/dashboard/staff', '/dashboard/settings']);
const MGR_ONLY = new Set([
  '/dashboard/purchases',
  '/dashboard/suppliers',
  '/dashboard/expenses',
  '/dashboard/adjustments',
  '/dashboard/reports',
]);

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role === 'super_admin') redirect('/dashboard/admin');

  const isMgr = ['owner', 'manager', 'super_admin'].includes(profile?.role);
  const isOwner = ['owner', 'super_admin'].includes(profile?.role);
  const modules = MODULES.filter(
    ([, , href]) => (isMgr || !MGR_ONLY.has(href)) && (isOwner || !OWNER_ONLY.has(href))
  );

  return (
    <div>
      <h1 className="text-xl font-bold">স্বাগতম, {profile?.full_name} 👋</h1>
      <p className="text-slate-500 text-sm mt-1 mb-5">আপনার দোকানের আজকের অবস্থা</p>

      <Summary role={profile?.role} />

      <h2 className="font-semibold mb-3">দ্রুত যান</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {modules.map(([icon, title, href]) => (
          <Link key={href} href={href} className="bg-white rounded-xl border p-4 hover:border-emerald-500">
            <div className="text-3xl">{icon}</div>
            <div className="font-medium mt-2 text-sm">{title}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
