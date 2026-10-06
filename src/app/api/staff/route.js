import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STAFF_ROLES = ['manager', 'cashier'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// শুধু সক্রিয় দোকানের মালিক এই API ব্যবহার করতে পারবে
async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'আগে লগইন করুন', status: 401 };

  const { data: prof } = await supabase
    .from('profiles')
    .select('role, shop_id, is_active, shops(status, trial_ends_at)')
    .eq('id', user.id)
    .maybeSingle();

  if (!prof || !prof.is_active || prof.role !== 'owner' || !prof.shop_id) {
    return { error: 'শুধু দোকানের মালিক এটা করতে পারবেন', status: 403 };
  }
  if (prof.shops?.status !== 'active') {
    return { error: 'আপনার দোকান এখন সক্রিয় নয়', status: 403 };
  }
  if (prof.shops?.trial_ends_at && new Date(prof.shops.trial_ends_at) < new Date()) {
    return { error: 'আপনার ট্রায়ালের মেয়াদ শেষ হয়েছে', status: 403 };
  }
  return { user, shopId: prof.shop_id };
}

const fail = (msg, status = 400) => NextResponse.json({ error: msg }, { status });

/* ---------- তালিকা ---------- */
export async function GET() {
  try {
    const auth = await requireOwner();
    if (auth.error) return fail(auth.error, auth.status);
    const admin = createAdminClient();

    const { data: rows, error } = await admin
      .from('profiles')
      .select('id, full_name, role, is_active, created_at')
      .eq('shop_id', auth.shopId)
      .order('created_at');
    if (error) return fail(error.message, 500);

    const staff = await Promise.all(
      rows.map(async (r) => {
        const { data } = await admin.auth.admin.getUserById(r.id);
        return { ...r, email: data?.user?.email || '' };
      })
    );
    return NextResponse.json({ staff, me: auth.user.id });
  } catch (e) {
    return fail(e.message, 500);
  }
}

/* ---------- নতুন স্টাফ ---------- */
export async function POST(req) {
  let createdUserId = null;
  try {
    const auth = await requireOwner();
    if (auth.error) return fail(auth.error, auth.status);

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.full_name || '').trim();
    const role = body.role;

    if (!fullName) return fail('নাম দিন');
    if (!EMAIL_RE.test(email)) return fail('সঠিক ইমেইল দিন');
    if (password.length < 6) return fail('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
    if (!STAFF_ROLES.includes(role)) return fail('ভুল রোল');

    const admin = createAdminClient();
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (cErr) {
      const msg = /already|registered|exists/i.test(cErr.message)
        ? 'এই ইমেইল আগে থেকেই ব্যবহার হচ্ছে'
        : cErr.message;
      return fail(msg);
    }
    createdUserId = created.user.id;

    const { error: pErr } = await admin.from('profiles').insert({
      id: createdUserId,
      shop_id: auth.shopId,
      full_name: fullName,
      role,
    });
    if (pErr) {
      await admin.auth.admin.deleteUser(createdUserId); // আধা-তৈরি অ্যাকাউন্ট সরিয়ে ফেলা
      return fail('স্টাফ তৈরি হয়নি: ' + pErr.message, 500);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
}

/* ---------- রোল / চালু-বন্ধ / পাসওয়ার্ড রিসেট ---------- */
export async function PATCH(req) {
  try {
    const auth = await requireOwner();
    if (auth.error) return fail(auth.error, auth.status);

    const body = await req.json();
    const id = body.id;
    if (!id) return fail('স্টাফ নির্বাচন করুন');
    if (id === auth.user.id) return fail('নিজের রোল বা অবস্থা এখান থেকে বদলানো যাবে না');

    const admin = createAdminClient();
    const { data: target } = await admin
      .from('profiles')
      .select('id, shop_id, role')
      .eq('id', id)
      .maybeSingle();
    if (!target || target.shop_id !== auth.shopId) return fail('স্টাফ পাওয়া যায়নি', 404);
    if (target.role === 'owner') return fail('মালিকের অ্যাকাউন্ট বদলানো যাবে না', 403);

    const update = {};
    if (body.role !== undefined) {
      if (!STAFF_ROLES.includes(body.role)) return fail('ভুল রোল');
      update.role = body.role;
    }
    if (body.is_active !== undefined) update.is_active = !!body.is_active;
    if (body.full_name !== undefined) {
      const n = String(body.full_name).trim();
      if (!n) return fail('নাম খালি হতে পারে না');
      update.full_name = n;
    }
    if (Object.keys(update).length > 0) {
      const { error } = await admin.from('profiles').update(update).eq('id', id);
      if (error) return fail(error.message, 500);
    }

    if (body.password !== undefined) {
      const pw = String(body.password);
      if (pw.length < 6) return fail('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
      const { error } = await admin.auth.admin.updateUserById(id, { password: pw });
      if (error) return fail(error.message, 500);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e.message, 500);
  }
}
