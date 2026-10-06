import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from './SignOutButton';
import Nav from './Nav';

const ROLE_LABEL = {
  super_admin: 'সুপার অ্যাডমিন',
  owner: 'মালিক',
  manager: 'ম্যানেজার',
  cashier: 'ক্যাশিয়ার',
};

export default async function DashboardLayout({ children }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, is_active, shops(name, status, trial_ends_at)')
    .eq('id', user.id)
    .maybeSingle();

  // এখনো দোকান খোলা হয়নি
  if (!profile) redirect('/register-shop');

  const shop = profile.shops;
  const isAdmin = profile.role === 'super_admin';
  const now = new Date();
  const trialEnd = shop?.trial_ends_at ? new Date(shop.trial_ends_at) : null;
  const expired = !!trialEnd && trialEnd < now;
  const daysLeft = trialEnd ? Math.ceil((trialEnd - now) / 86400000) : null;
  const support = process.env.NEXT_PUBLIC_SUPPORT_PHONE;

  let blockMsg = null;
  if (!profile.is_active) {
    blockMsg = 'আপনার অ্যাকাউন্ট বন্ধ করা হয়েছে। দোকানের মালিকের সাথে যোগাযোগ করুন।';
  } else if (shop && shop.status === 'pending') {
    blockMsg = 'আপনার দোকান অনুমোদনের অপেক্ষায় আছে। অনুমোদন হলে ব্যবহার করতে পারবেন।';
  } else if (shop && shop.status === 'suspended') {
    blockMsg = 'আপনার দোকানটি স্থগিত করা হয়েছে। চালু করতে সাপোর্টে যোগাযোগ করুন।';
  } else if (shop && expired) {
    blockMsg = 'আপনার ট্রায়ালের মেয়াদ শেষ হয়েছে। চালিয়ে যেতে সাপোর্টে যোগাযোগ করুন।';
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b sticky top-0 z-10 no-print">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="font-bold">{isAdmin ? '🛡️ POS অ্যাডমিন' : `🛒 ${shop?.name ?? 'POS'}`}</div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-emerald-100 text-emerald-800 rounded-full px-2 py-1">
              {ROLE_LABEL[profile.role]}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      {!blockMsg && <Nav role={profile.role} />}

      {!blockMsg && !isAdmin && daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-2 text-center no-print">
          ট্রায়ালের আর {daysLeft} দিন বাকি।
          {support ? ` চালিয়ে যেতে যোগাযোগ করুন: ${support}` : ' চালিয়ে যেতে সাপোর্টে যোগাযোগ করুন।'}
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4">
        {blockMsg ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-5">
            <p>{blockMsg}</p>
            {support && shop && profile.role === 'owner' && (
              <p className="mt-2 font-medium">
                সাপোর্ট: <a href={`tel:${support}`}>{support}</a>
              </p>
            )}
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
