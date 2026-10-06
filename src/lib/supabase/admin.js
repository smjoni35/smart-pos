// ⚠️ শুধু সার্ভার কোডে (API route) ব্যবহার করুন — কখনো 'use client' ফাইলে import করবেন না।
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY সেট করা নেই (.env.local দেখুন)');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
