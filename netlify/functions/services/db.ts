import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient | null {
  if (supabase) return supabase
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY
  if (!url || !key) return null
  supabase = createClient(url, key)
  return supabase
}

export async function rulesGetAll() {
  const client = getSupabase()
  if (!client) return []
  const { data } = await client
    .from('rules')
    .select('rule_number, content')
    .order('rule_number', { ascending: true })
  return data || []
}

export async function ruleExists(rule_number: number): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false
  const { data } = await client.from('rules').select('rule_number').eq('rule_number', rule_number).limit(1)
  return (data || []).length > 0
}

export async function rulesNextNumber(): Promise<number> {
  const client = getSupabase()
  if (!client) return 1
  const { data } = await client
    .from('rules')
    .select('rule_number')
    .order('rule_number', { ascending: false })
    .limit(1)
  const max = (data && (data[0] as any)?.rule_number) || 0
  return Number(max) + 1
}

export async function rulesUpsert(rule_number: number, content: string): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false
  const now = new Date().toISOString()
  const { error } = await client
    .from('rules')
    .upsert({ rule_number, content, updated_at: now }, { onConflict: 'rule_number' })
  return !error
}

export async function rulesDelete(rule_number: number): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false
  const { error } = await client.from('rules').delete().eq('rule_number', rule_number)
  return !error
}

export async function pollsUpsert(meta: {
  poll_id: string
  chat_id: number
  message_id: number
  creator_user_id?: number
  question?: string
  options?: string[]
}) {
  const client = getSupabase()
  if (!client) return
  const { poll_id, chat_id, message_id, creator_user_id, question, options } = meta
  await client
    .from('polls')
    .upsert({
      poll_id,
      chat_id,
      message_id,
      creator_user_id,
      question,
      options_json: JSON.stringify(options || []),
    })
}

export async function pollsUpdateResults(poll_id: string, is_closed: boolean, results: Record<string, number>) {
  const client = getSupabase()
  if (!client) return
  await client
    .from('polls')
    .update({ is_closed: is_closed ? 1 : 0, results_json: JSON.stringify(results || {}) })
    .eq('poll_id', poll_id)
}

export async function pollsGet(poll_id: string) {
  const client = getSupabase()
  if (!client) return null
  const { data, error } = await client.from('polls').select('*').eq('poll_id', poll_id).single()
  if (error) return null
  return data
}


