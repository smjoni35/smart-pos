# POS App (ধাপ ২: সেটআপ, লগইন, দোকান রেজিস্ট্রেশন)

## চালানোর নিয়ম
1. `npm install`
2. `.env.local.example` কপি করে `.env.local` বানান, Supabase URL ও anon key বসান
3. Supabase > Authentication > Providers > Email > "Confirm email" আপাতত বন্ধ রাখুন (ডেভেলপমেন্টের জন্য)
4. `npm run dev` → http://localhost:3000

## ফ্লো
signup → দোকান তৈরি (register_shop) → dashboard

---
# ধাপ ৩: পণ্য ও ক্যাটাগরি
1. Supabase SQL Editor-এ `supabase/step3_migration.sql` একবার রান করুন (ক্যাশিয়ারের কাছ থেকে কেনা দাম লুকানোর জন্য)
2. `src` ফোল্ডার রিপ্লেস করুন (`.env.local` ও `node_modules` অক্ষত থাকবে)
3. নতুন পেজ: /dashboard/products, /dashboard/categories

---
# ধাপ ৪: POS বিক্রয় স্ক্রিন
1. Supabase SQL Editor-এ `supabase/step4_migration.sql` একবার রান করুন (ক্যাশিয়ার থেকে লাভ/কেনা দাম লুকানোর জন্য)
2. `src` ফোল্ডার রিপ্লেস করুন
3. নতুন পেজ: /dashboard/pos (বিক্রি), /dashboard/sales (বিক্রির তালিকা ও রসিদ)

---
# ধাপ ৫: কাস্টমার ও বাকির খাতা, সাপ্লায়ার, মাল কেনা
1. Supabase SQL Editor-এ `supabase/step5_migration.sql` একবার রান করুন
2. `src` ফোল্ডার রিপ্লেস করুন
3. নতুন পেজ: /dashboard/customers, /dashboard/suppliers, /dashboard/purchases

---
# ধাপ ৬: খরচ, নষ্ট মাল, রিপোর্ট, ড্যাশবোর্ড সারাংশ
1. Supabase SQL Editor-এ `supabase/step6_migration.sql` একবার রান করুন
2. `src` ফোল্ডার রিপ্লেস করুন (নতুন `src/lib/dates.js` সহ)
3. নতুন পেজ: /dashboard/expenses, /dashboard/adjustments, /dashboard/reports

---
# ধাপ ৭: স্টাফ ম্যানেজমেন্ট ও দোকানের সেটিংস
1. Supabase SQL Editor-এ `supabase/step7_migration.sql` রান করুন
2. Supabase > Project Settings > API থেকে **service_role** কী কপি করে `.env.local`-এ `SUPABASE_SERVICE_ROLE_KEY=` হিসেবে বসান
   (⚠️ এটা গোপন কী: `NEXT_PUBLIC_` দিয়ে শুরু করবেন না, GitHub-এ তুলবেন না)
3. `src` রিপ্লেস করে dev সার্ভার রিস্টার্ট করুন (env বদলালে রিস্টার্ট লাগে)
4. নতুন পেজ: /dashboard/staff, /dashboard/settings (শুধু মালিক)

---
# ধাপ ৮: সুপার অ্যাডমিন প্যানেল ও ট্রায়াল কার্যকর করা
1. Supabase SQL Editor-এ `supabase/step8_migration.sql` রান করুন
2. সুপার অ্যাডমিন বানাতে: আলাদা ইমেইলে সাইন আপ করুন (দোকান খুলবেন না), তারপর ওই ফাইলের উপরের কমেন্টের SQL রান করুন
3. `src` রিপ্লেস করুন। সুপার অ্যাডমিন লগইন করলে সরাসরি /dashboard/admin খুলবে
4. (ঐচ্ছিক) `.env.local`-এ `NEXT_PUBLIC_SUPPORT_PHONE` বসান
