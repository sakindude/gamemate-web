import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing')
}

if (!supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is missing')
}

// 👇 TS'e zorla: artık bunlar kesin string
const url: string = supabaseUrl
const key: string = supabaseAnonKey

declare global {
  // eslint-disable-next-line no-var
  var __gamemate_supabase__: SupabaseClient | undefined
}

function createSupabaseSingleton() {
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

export const supabase =
  globalThis.__gamemate_supabase__ ?? createSupabaseSingleton()

if (typeof window !== 'undefined') {
  globalThis.__gamemate_supabase__ = supabase
}