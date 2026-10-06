'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <button onClick={signOut} className="text-sm text-slate-600 hover:text-red-600">
      লগআউট
    </button>
  );
}
