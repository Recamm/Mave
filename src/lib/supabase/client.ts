import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

let cachedClient: SupabaseClient<Database> | null | undefined;

export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    cachedClient = null;
    return cachedClient;
  }

  try {
    cachedClient = createClient<Database>(url, publishableKey);
  } catch {
    cachedClient = null;
  }

  return cachedClient;
}
