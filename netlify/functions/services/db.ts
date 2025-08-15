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


// Polls storage (snapshot)
export type StoredPoll = {
  poll_id: string
  chat_id: number
  message_id: number
  question: string
  options: { text: string; voter_count: number }[]
  is_closed: boolean
  created_at?: string
}

export async function pollsUpsert(poll: StoredPoll): Promise<boolean> {
  const client = getSupabase()
  if (!client) return false
  
  const now = new Date().toISOString()
  const { error } = await client
    .from('polls')
    .upsert(
      {
        poll_id: poll.poll_id,
        chat_id: poll.chat_id,
        message_id: poll.message_id,
        question: poll.question,
        options: poll.options,
        is_closed: poll.is_closed,
        created_at: poll.created_at || now
      },
      { onConflict: 'poll_id' }
    )
  return !error
}

export async function pollGetById(poll_id: string): Promise<StoredPoll | null> {
  const client = getSupabase()
  if (!client) return null
  const { data } = await client.from('polls').select('*').eq('poll_id', poll_id).limit(1)
  return (data && (data[0] as any)) || null
}

export async function pollsGetOpenByChatId(chat_id: number): Promise<StoredPoll[]> {
  const client = getSupabase()
  if (!client) return []
  const { data } = await client
    .from('polls')
    .select('*')
    .eq('chat_id', chat_id)
    .eq('is_closed', false)
    .order('created_at', { ascending: false })
  return (data || []) as StoredPoll[]
}

export async function pollsGetClosedByChatId(chat_id: number): Promise<StoredPoll[]> {
  const client = getSupabase()
  if (!client) return []
  const { data } = await client
    .from('polls')
    .select('*')
    .eq('chat_id', chat_id)
    .eq('is_closed', true)
    .order('created_at', { ascending: false })
  return (data || []) as StoredPoll[]
}


