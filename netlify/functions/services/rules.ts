import { getStore } from '@netlify/blobs'
import seed from '../data/rules.seed.json' with { type: 'json' }

export type Rule = { rule_number: number; content: string }

const BLOB_KEY = 'all'

function store() {
  return getStore('rules')
}

async function readAll(): Promise<Rule[]> {
  const data = await store().get(BLOB_KEY, { type: 'json' })
  if (data) return data as Rule[]
  const initial = (seed as Rule[]).slice().sort((a, b) => a.rule_number - b.rule_number)
  await writeAll(initial)
  return initial
}

async function writeAll(rules: Rule[]): Promise<void> {
  const sorted = rules.slice().sort((a, b) => a.rule_number - b.rule_number)
  await store().setJSON(BLOB_KEY, sorted)
}

export async function rulesGetAll(): Promise<Rule[]> {
  return readAll()
}

export async function ruleExists(rule_number: number): Promise<boolean> {
  const rules = await readAll()
  return rules.some((r) => r.rule_number === rule_number)
}

export async function rulesNextNumber(): Promise<number> {
  const rules = await readAll()
  const max = rules.reduce((m, r) => Math.max(m, r.rule_number), 0)
  return max + 1
}

export async function rulesUpsert(rule_number: number, content: string): Promise<boolean> {
  try {
    const rules = await readAll()
    const idx = rules.findIndex((r) => r.rule_number === rule_number)
    if (idx >= 0) rules[idx] = { rule_number, content }
    else rules.push({ rule_number, content })
    await writeAll(rules)
    return true
  } catch (error) {
    console.error('❌ rulesUpsert: errore:', error)
    return false
  }
}

export async function rulesDelete(rule_number: number): Promise<boolean> {
  try {
    const rules = await readAll()
    const next = rules.filter((r) => r.rule_number !== rule_number)
    await writeAll(next)
    return true
  } catch (error) {
    console.error('❌ rulesDelete: errore:', error)
    return false
  }
}
