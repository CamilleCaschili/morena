import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configOk = Boolean(url && key)

export const supabase = createClient(url || 'https://invalid.local', key || 'invalid', {
  // flux « implicit » : le lien magique fonctionne même s'il s'ouvre dans le navigateur intégré d'une appli mail
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
})
