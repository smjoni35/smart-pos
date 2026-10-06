'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// [লিংক, নাম, কে দেখবে: null = সবাই, 'mgr' = মালিক/ম্যানেজার, 'owner' = শুধু মালিক]
const ITEMS = [
  ['/dashboard', '🏠 হোম', null],
  ['/dashboard/pos', '🧾 বিক্রি (POS)', null],
  ['/dashboard/sales', '📜 বিক্রির তালিকা', null],
  ['/dashboard/products', '📦 পণ্য', null],
  ['/dashboard/categories', '🏷️ ক্যাটাগরি', null],
  ['/dashboard/customers', '👥 কাস্টমার ও বাকি', null],
  ['/dashboard/purchases', '🛍️ মাল কেনা', 'mgr'],
  ['/dashboard/suppliers', '🚚 সাপ্লায়ার', 'mgr'],
  ['/dashboard/expenses', '💸 খরচ', 'mgr'],
  ['/dashboard/adjustments', '🗑️ নষ্ট মাল', 'mgr'],
  ['/dashboard/reports', '📊 রিপোর্ট', 'mgr'],
  ['/dashboard/staff', '👨‍💼 স্টাফ', 'owner'],
  ['/dashboard/settings', '⚙️ সেটিংস', 'owner'],
];

// সুপার অ্যাডমিনের কোনো দোকান নেই, তাই আলাদা মেনু
const ADMIN_ITEMS = [['/dashboard/admin', '🛡️ সব দোকান']];

function visible(level, role) {
  if (!level) return true;
  if (level === 'mgr') return ['owner', 'manager'].includes(role);
  if (level === 'owner') return role === 'owner';
  return false;
}

export default function Nav({ role }) {
  const path = usePathname();
  const items =
    role === 'super_admin' ? ADMIN_ITEMS : ITEMS.filter(([, , level]) => visible(level, role));
  return (
    <nav className="bg-white border-b overflow-x-auto no-print">
      <div className="max-w-5xl mx-auto px-4 flex gap-1 whitespace-nowrap">
        {items.map(([href, label]) => {
          const active = href === '/dashboard' ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2.5 text-sm border-b-2 ${
                active
                  ? 'border-emerald-600 text-emerald-700 font-medium'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
