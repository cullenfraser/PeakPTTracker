import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const supabaseUrl = Deno.env.get('PROJECT_URL')
const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase service environment variables')
}

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null

type AddTrainerPayload = {
  email: string
  password: string
  first_name: string
  last_name: string
  phone?: string | null
  payment_type: string
  hourly_rate?: number | null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Service client not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let payload: AddTrainerPayload
  try {
    payload = await req.json()
  } catch (_error) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const required = ['email', 'password', 'first_name', 'last_name'] as const
  for (const field of required) {
    if (!payload[field] || typeof payload[field] !== 'string') {
      return new Response(
        JSON.stringify({ error: `Missing or invalid field: ${field}` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
  }

  try {
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
    })

    if (userError || !userData?.user) {
      throw userError || new Error('Failed to create user')
    }

    const trainerRecord: Record<string, unknown> = {
      user_id: userData.user.id,
      email: payload.email,
      first_name: payload.first_name,
      last_name: payload.last_name,
      phone: payload.phone ?? null,
      payment_type: payload.payment_type,
    }

    if (typeof payload.hourly_rate === 'number') {
      trainerRecord.hourly_rate = payload.hourly_rate
    }

    const { error: insertError } = await supabaseAdmin.from('trainers').insert(trainerRecord)
    if (insertError) {
      throw insertError
    }

    return new Response(JSON.stringify({ success: true, user_id: userData.user.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error creating trainer:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
