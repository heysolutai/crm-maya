import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Admin client with service_role_key for API routes that need to bypass RLS
// NEVER use this on the client side
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
