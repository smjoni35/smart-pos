'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const TYPES = [
  ['grocery', 'মুদি দোকান'],
  ['supershop', 'সুপারশপ'],
  ['library', 'লাইব্রেরি / বই-খাতা'],
  ['pharmacy', 'ফার্মেসি'],
  ['electronics', 'ইলেকট্রনিক্স'],
  ['clothing', 'কাপড় / জুতা'],
  ['general', 'অন্যান্য'],
];

export default function RegisterShopPage() {
  const router = useRouter();
  const supabase = createClient();
  const [shopName, setShopName] = useState('');
  const [type, setType] = useState('grocery');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.rpc('register_shop', {
      p_shop_name: shopName.trim(),
      p_business_type: type,
      p_full_name: fullName.trim(),
    });
    setLoading(false);
    if (error) {
      if (error.message.includes('Already registered')) {
        router.push('/dashboard');
        router.refresh();
        return;
      }
      return setError('দোকান তৈরি করা যায়নি: ' + error.message);
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6">
        <h1 className="text-xl font-bold text-center">আপনার দোকান তৈরি করুন</h1>
        <p className="text-center text-slate-500 text-sm mt-1 mb-6">মাত্র তিনটি তথ্য দিন</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">দোকানের নাম</label>
            <input
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">ব্যবসার ধরন</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {TYPES.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">মালিকের নাম</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 font-medium disabled:opacity-60"
          >
            {loading ? 'তৈরি হচ্ছে...' : 'দোকান তৈরি করুন'}
          </button>
        </form>
      </div>
    </main>
  );
}
