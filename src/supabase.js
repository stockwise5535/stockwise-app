import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configurationError = !url || !key || /xxxx|your-project/.test(url) || key === 'eyJ...'
  ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in environment settings; never use a service-role key in the browser.'
  : null
export const supabase = configurationError ? null : createClient(url,key)
