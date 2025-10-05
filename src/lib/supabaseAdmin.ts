/// <reference types="vite/client" />

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

// WARNING: The service role key must only be used in trusted (server-side) environments.
// When unavailable (e.g. client bundles), return null and ensure callers handle it.
export const supabaseAdmin = !supabaseUrl || !serviceRoleKey
  ? null
  : createClient<Database>(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
