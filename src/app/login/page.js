'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) return setError('ইমেইল বা পাসওয়ার্ড ভুল হয়েছে');
      router.push('/dashboard');
      router.refresh();
    } else {
      if (password.length < 6) {
        setLoading(false);
        return setError('পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে');
      }
      const { data, error } = await supabase.auth.signUp({ email, password });
      setLoading(false);
      if (error) return setError(error.message);
      if (data.session) {
        router.push('/register-shop');
        router.refresh();
      } else {
        setInfo('আপনার ইমেইলে একটি নিশ্চিতকরণ লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে তারপর লগইন করুন।');
      }
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6">
        <h1 className="text-2xl font-bold text-center">🛒 POS</h1>
        <p className="text-center text-slate-500 text-sm mt-1 mb-6">
          {mode === 'login' ? 'আপনার দোকানে লগইন করুন' : 'নতুন অ্যাকাউন্ট খুলুন'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">ইমেইল</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">পাসওয়ার্ড</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-emerald-700">{info}</p>}

          <button
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 font-medium disabled:opacity-60"
          >
            {loading ? 'অপেক্ষা করুন...' : mode === 'login' ? 'লগইন' : 'অ্যাকাউন্ট খুলুন'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError('');
            setInfo('');
          }}
          className="w-full text-center text-sm text-emerald-700 mt-4"
        >
          {mode === 'login' ? 'নতুন? অ্যাকাউন্ট খুলুন' : 'আগে থেকেই অ্যাকাউন্ট আছে? লগইন করুন'}
        </button>
      </div>
    </main>
  );
}
