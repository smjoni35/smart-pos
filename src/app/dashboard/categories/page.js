'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function CategoriesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ctx, setCtx] = useState(null);
  const [categories, setCategories] = useState([]);
  const [counts, setCounts] = useState({});
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canEdit = !!ctx && ['owner', 'manager'].includes(ctx.role);

  async function load() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from('profiles')
      .select('role, shop_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!prof) {
      setError('প্রোফাইল লোড করা যায়নি');
      setLoading(false);
      return;
    }
    setCtx({ role: prof.role, shopId: prof.shop_id });

    const table = ['owner', 'manager'].includes(prof.role) ? 'products' : 'pos_products';
    const [c, p] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from(table).select('category_id'),
    ]);
    setCategories(c.data ?? []);
    const map = {};
    (p.data ?? []).forEach((r) => {
      if (r.category_id) map[r.category_id] = (map[r.category_id] || 0) + 1;
    });
    setCounts(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.from('categories').insert({ shop_id: ctx.shopId, name: n });
    setBusy(false);
    if (error) {
      setError(error.code === '23505' ? 'এই ক্যাটাগরি আগে থেকেই আছে' : 'যোগ করা যায়নি: ' + error.message);
      return;
    }
    setName('');
    load();
  }

  async function rename(c) {
    const n = prompt('নতুন নাম দিন', c.name);
    if (!n || !n.trim() || n.trim() === c.name) return;
    const { error } = await supabase.from('categories').update({ name: n.trim() }).eq('id', c.id);
    if (error) return alert(error.code === '23505' ? 'এই নামে ক্যাটাগরি আছে' : error.message);
    load();
  }

  async function remove(c) {
    const n = counts[c.id] || 0;
    const msg = n
      ? `"${c.name}" মুছলে এর ${n}টি পণ্য "ক্যাটাগরি নেই" হয়ে যাবে। মুছবেন?`
      : `"${c.name}" মুছে ফেলবেন?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.from('categories').delete().eq('id', c.id);
    if (error) return alert('মুছা যায়নি: ' + error.message);
    load();
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-xl font-bold mb-4">🏷️ ক্যাটাগরি</h1>

      {canEdit && (
        <form onSubmit={add} className="flex gap-2 mb-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="নতুন ক্যাটাগরির নাম (যেমন: চাল-ডাল)"
            className="flex-1 min-w-0 border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 text-sm font-medium disabled:opacity-60"
          >
            যোগ
          </button>
        </form>
      )}

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {loading ? (
        <p className="text-slate-500">লোড হচ্ছে...</p>
      ) : categories.length === 0 ? (
        <div className="bg-white border rounded-xl p-8 text-center text-slate-500">
          এখনো কোনো ক্যাটাগরি নেই।
        </div>
      ) : (
        <div className="bg-white border rounded-xl divide-y">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-slate-500">{counts[c.id] || 0}টি পণ্য</div>
              </div>
              {canEdit && (
                <div className="flex gap-3 text-xs">
                  <button onClick={() => rename(c)} className="text-emerald-700">
                    নাম বদলান
                  </button>
                  <button onClick={() => remove(c)} className="text-red-600">
                    মুছুন
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
