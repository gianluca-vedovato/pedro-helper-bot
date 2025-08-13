import { Telegraf } from 'telegraf'
import type { Context } from 'telegraf'
import { askAboutRules, decideRuleActionWithTools } from './services/ai'
import {
  getSupabase,
  pollsGet,
  pollsUpdateResults,
  pollsUpsert,
  ruleExists,
  rulesDelete,
  rulesGetAll,
  rulesNextNumber,
  rulesUpsert
} from './services/db'

const BOT_TOKEN = process.env.BOT_TOKEN

let bot: Telegraf<Context> | null = null

function ensureBot() {
  if (!bot) {
    console.log('🤖 Inizializzazione bot...')
    if (!BOT_TOKEN) {
      console.error('❌ BOT_TOKEN mancante')
      throw new Error('Missing BOT_TOKEN')
    }
    console.log('✅ BOT_TOKEN trovato, creo istanza Telegraf')
    bot = new Telegraf(BOT_TOKEN)
    console.log('✅ Istanza Telegraf creata, configuro comandi...')

    bot.start(async (ctx) => {
      console.log('🚀 Comando /start ricevuto')
      await ctx.reply('Ciao! Sono Pedro (Node). Comandi:\n/regolamento [n]\n/askpedro [domanda]\n/promemoria, /promemoria_lista, /promemoria_cancella')
    })

    bot.help(async (ctx) => {
      console.log('❓ Comando /help ricevuto')
      await ctx.reply('Comandi:\n/start\n/help\n/regolamento [numero]\n/askpedro [domanda]\n/promemoria <testo>\n/promemoria_lista\n/promemoria_cancella <id>')
    })

    bot.command('regolamento', async (ctx) => {
      console.log('📚 Comando /regolamento ricevuto')
      const arg = (ctx.message?.text || '').split(' ').slice(1).join(' ').trim()
      const rules = await rulesGetAll()
      if (!rules.length) return ctx.reply('❌ Nessuna regola caricata.')
      if (arg) {
        const n = Number(arg)
        if (!Number.isInteger(n)) return ctx.reply('❌ Numero regola non valido.')
        const found = rules.find((r: any) => r.rule_number === n)
        if (!found) return ctx.reply(`❌ Regola ${n} non trovata.`)
        return ctx.reply(`📋 Regola ${n}:\n\n${formatRule(found.content)}`, { parse_mode: 'Markdown' })
      }
      let resp = '📚 Regolamento Completo:\n\n'
      for (const r of rules as any[]) resp += `**${r.rule_number}.** ${formatRule(r.content)}\n\n`
      for (let i = 0; i < resp.length; i += 4096) await ctx.reply(resp.slice(i, i + 4096), { parse_mode: 'Markdown' })
    })

    bot.command('askpedro', async (ctx) => {
      console.log('🤖 Comando /askpedro ricevuto')
      const q = (ctx.message?.text || '').split(' ').slice(1).join(' ').trim()
      if (!q) return ctx.reply('❌ Uso: /askpedro [domanda]')
      const rules = await rulesGetAll()
      if (!rules.length) return ctx.reply('❌ Nessuna regola caricata.')
      const rulesText = (rules as any[]).map((r) => `${r.rule_number}. ${r.content}`).join('\n\n')
      const answer = await askAboutRules(q, rulesText)
      await ctx.reply(answer, { parse_mode: 'Markdown' })
    })

    bot.command('promemoria', async (ctx) => {
      console.log('📝 Comando /promemoria ricevuto')
      const text = (ctx.message?.text || '').split(' ').slice(1).join(' ').trim()
      if (!text) return ctx.reply('Uso: /promemoria <testo>')
      const chat_id = ctx.chat?.id
      const user = ctx.from || ({} as any)
      const user_name = user.username || `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Utente'
      const supabase = getSupabase()
      if (!supabase) return ctx.reply('DB non configurato.')
      const { data, error } = await supabase.from('reminders').insert({ chat_id, user_id: user.id, user_name, text }).select('id').single()
      if (error) return ctx.reply('❌ Errore nel salvataggio del promemoria.')
      return ctx.reply(`✅ Promemoria salvato (#${(data as any).id})\n${text}`)
    })

    bot.command('promemoria_lista', async (ctx) => {
      console.log('📋 Comando /promemoria_lista ricevuto')
      const chat_id = ctx.chat?.id
      const supabase = getSupabase()
      if (!supabase) return ctx.reply('DB non configurato.')
      const { data, error } = await supabase.from('reminders').select('id,user_name,text,created_at').eq('chat_id', chat_id).order('id', { ascending: false })
      if (error) return ctx.reply('Errore nel recupero promemoria.')
      if (!data?.length) return ctx.reply('Nessun promemoria salvato per questo gruppo.')
      const lines = (data as any[]).map((r) => `${r.id}. ${r.text}\n   — ${r.user_name} • ${r.created_at}`)
      const response = `📝 Promemoria salvati:\n\n${lines.join('\n')}`
      for (let i = 0; i < response.length; i += 4096) await ctx.reply(response.slice(i, i + 4096))
    })

    bot.command('promemoria_cancella', async (ctx) => {
      console.log('🗑️ Comando /promemoria_cancella ricevuto')
      const arg = (ctx.message?.text || '').split(' ').slice(1)[0]
      const chat_id = ctx.chat?.id
      const requester_user_id = ctx.from?.id
      const id = Number(arg)
      if (!Number.isInteger(id)) return ctx.reply('Uso: /promemoria_cancella <id>')
      const supabase = getSupabase()
      if (!supabase) return ctx.reply('DB non configurato.')
      const { data, error } = await supabase.from('reminders').delete().eq('id', id).eq('chat_id', chat_id).eq('user_id', requester_user_id).select('id')
      if (error) return ctx.reply('❌ Errore nella cancellazione.')
      if (!data?.length) return ctx.reply('❌ Promemoria non trovato o non autorizzato a cancellarlo.')
      return ctx.reply('✅ Promemoria cancellato.')
    })

    bot.on('message', async (ctx) => {
      const m: any = ctx.message as any
      const poll = m?.poll as any
      if (!poll) return
      console.log('🗳️ Messaggio con sondaggio ricevuto:', { poll_id: poll.id, question: poll.question })
      const poll_id = poll.id as string
      const chat_id = ctx.chat?.id as number
      const message_id = ctx.message?.message_id as number
      const creator_user_id = ctx.from?.id as number
      const question = poll.question || ''
      const options = (poll.options || []).map((o: any) => o.text)
      await pollsUpsert({ poll_id, chat_id, message_id, creator_user_id, question, options })
      
      const text = `🗳️ **Sondaggio registrato!**\n\n📝 **Domanda:** ${question}\n🔢 **Opzioni:** ${options.join(', ')}\n🆔 **ID:** \`${poll_id}\`\n\n💡 **Per applicare i risultati:**\n• Rispondi a questo messaggio con \`/applica_sondaggio\`\n• Oppure usa \`/applica_sondaggio ${poll_id}\`\n\n⚠️ Solo gli amministratori possono applicare i risultati.`
      
      await ctx.reply(text, { 
        parse_mode: 'Markdown', 
        reply_markup: { 
          inline_keyboard: [[{ text: '🔧 Applica sondaggio', callback_data: `apply:${poll_id}` }]] 
        } 
      })
    })

    bot.on('poll', async (ctx) => {
      const poll = (ctx.update as any)?.poll
      if (!poll) return
      console.log('📊 Aggiornamento sondaggio ricevuto:', { poll_id: poll.id, is_closed: poll.is_closed })
      const results = Object.fromEntries((poll.options || []).map((o: any) => [o.text, o.voter_count]))
      await pollsUpdateResults(poll.id, !!poll.is_closed, results)

      // Se il sondaggio è chiuso, applica automaticamente le decisioni
      if (poll.is_closed) {
        try {
          console.log('🔔 Sondaggio chiuso. Avvio applicazione automatica dei risultati...')
          const pollRow = await pollsGet(poll.id)
          if (!pollRow) {
            console.log('❌ Sondaggio non trovato nel database per auto-applicazione')
            return
          }

          const question = (pollRow as any).question || ''
          let options: string[] = []
          try { options = JSON.parse((pollRow as any).options_json || '[]') } catch {}
          let storedResults: Record<string, number> = {}
          try { storedResults = JSON.parse((pollRow as any).results_json || '{}') } catch {}

          // Se per qualche motivo i risultati nel DB non ci sono ancora, usa quelli dell'update corrente
          const effectiveResults = Object.keys(storedResults).length ? storedResults : results

          const sorted = Object.entries(effectiveResults).sort((a, b) => (b[1] as number) - (a[1] as number))
          const winning = sorted.length ? sorted[0][0] : null
          const summary = sorted.length ? sorted.map(([o, c]) => `${o}: ${c}`).join(', ') : null

          const rules = await rulesGetAll()
          const rulesText = (rules as any[]).map((r) => `${r.rule_number}. ${r.content}`).join('\n\n')

          const chat_id = (pollRow as any).chat_id as number
          if (!chat_id) {
            console.log('❌ chat_id mancante per auto-applicazione')
            return
          }

          console.log('🚀 Auto-applico sondaggio chiuso:', { question, options, winning, summary, chat_id })
          const ctxLike: any = {
            reply: (text: string, extra?: any) => (bot as Telegraf).telegram.sendMessage(chat_id, text, extra)
          }

          await applyDecisionFromAI(ctxLike, { question, options, winning, resultsSummary: summary, rulesText })
        } catch (err) {
          console.error('❌ Errore durante l\'auto-applicazione del sondaggio:', err)
        }
      }
    })

    bot.action(/apply:.+/, async (ctx) => {
      const data = (ctx.match as any)?.input || ''
      const poll_id = String(data.split(':')[1] || '').trim()
      console.log('🔘 Callback button apply cliccato per poll_id:', poll_id)
      if (!poll_id) return ctx.answerCbQuery('ID sondaggio mancante')
      const chat_id = ctx.chat?.id as number
      const user_id = ctx.from?.id as number
      const isAdmin = await isUserAdmin(chat_id, user_id)
      if (!isAdmin) return ctx.answerCbQuery('Solo gli admin possono applicare.')
      await handleApplyPoll(ctx, poll_id)
      await ctx.answerCbQuery()
    })

    bot.command('applica_sondaggio', async (ctx) => {
      console.log('🔍 Comando applica_sondaggio ricevuto:', {
        text: ctx.message?.text,
        chat_id: ctx.chat?.id,
        user_id: ctx.from?.id,
        reply_to_message: (ctx.message as any)?.reply_to_message
      })
      
      let poll_id = (ctx.message?.text || '').split(' ').slice(1)[0]
      
      // Se non è specificato un poll_id, controlla se è una risposta a un messaggio
      if (!poll_id) {
        const reply_to_message = (ctx.message as any)?.reply_to_message
        if (reply_to_message?.poll?.id) {
          // È una risposta a un messaggio con sondaggio
          poll_id = reply_to_message.poll.id
          console.log('📎 Poll ID estratto dalla risposta:', poll_id)
        } else {
          console.log('❌ Nessun poll_id trovato e non è una risposta a un sondaggio')
          return ctx.reply('❌ Uso: /applica_sondaggio <poll_id> oppure rispondi al messaggio del sondaggio con /applica_sondaggio')
        }
      } else {
        console.log('📝 Poll ID specificato come parametro:', poll_id)
      }
      
      const chat_id = ctx.chat?.id as number
      const user_id = ctx.from?.id as number
      console.log('🔐 Verifico permessi admin per:', { chat_id, user_id })
      
      const isAdmin = await isUserAdmin(chat_id, user_id)
      if (!isAdmin) {
        console.log('❌ Utente non è admin')
        return ctx.reply('❌ Solo gli amministratori possono applicare un sondaggio.')
      }
      
      console.log('✅ Utente è admin, procedo con applicazione sondaggio:', poll_id)
      await handleApplyPoll(ctx, poll_id)
    })

    bot.command('sondaggio_manuale', async (ctx) => {
      console.log('🔧 Comando /sondaggio_manuale ricevuto')
      const txt = ctx.message?.text || ''
      const parts = parseQuotedArgs(txt)
      if (parts.length < 2) return ctx.reply('Uso: /sondaggio_manuale "Domanda" "Opzione vincente" ["Opz1|Opz2|..."]')
      const chat_id = ctx.chat?.id as number
      const user_id = ctx.from?.id as number
      const isAdmin = await isUserAdmin(chat_id, user_id)
      if (!isAdmin) return ctx.reply('❌ Solo gli amministratori possono applicare un sondaggio manuale.')
      const question = parts[0]
      const winning = parts[1]
      const options = parts[2] ? parts[2].split('|').map((s: string) => s.trim()).filter(Boolean) : undefined
      await applyDecisionFromAI(ctx, { question, options, winning, resultsSummary: null })
    })
    
    console.log('✅ Tutti i comandi configurati')
  } else {
    console.log('🤖 Bot già inizializzato')
  }
}

function formatRule(content: string) {
  return content.replace(/○/g, '•').replace(/●/g, '•').replace(/ •/g, '\n•').replace(/•/g, '• ').replace(/  /g, ' ')
}

async function isUserAdmin(chat_id?: number, user_id?: number) {
  try {
    if (!chat_id || !user_id) return false
    const member = await (bot as Telegraf).telegram.getChatMember(chat_id, user_id)
    const status = (member as any)?.status || ''
    return ['administrator', 'creator', 'owner'].includes(status)
  } catch {
    return false
  }
}

function parseQuotedArgs(text: string) {
  const re = /\"([^\"]*)\"|([^\s]+)/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) out.push(m[1])
    else if (m[2] !== undefined) out.push(m[2])
  }
  return out.filter((s) => !s.startsWith('/sondaggio_manuale'))
}

async function handleApplyPoll(ctx: Context, poll_id: string) {
  console.log('🔍 handleApplyPoll chiamato con poll_id:', poll_id)
  
  const pollRow = await pollsGet(poll_id)
  if (!pollRow) {
    console.log('❌ Sondaggio non trovato nel database')
    return (ctx as any).reply('❌ Sondaggio non trovato nel database. Rispondi al messaggio del sondaggio con /applica_sondaggio oppure riprova più tardi.')
  }
  
  console.log('✅ Sondaggio trovato:', pollRow)
  
  const rules = await rulesGetAll()
  console.log('📚 Regole caricate:', rules.length)
  
  const rulesText = (rules as any[]).map((r) => `${r.rule_number}. ${r.content}`).join('\n\n')
  const question = (pollRow as any).question || ''
  let options: string[] = []
  try { options = JSON.parse((pollRow as any).options_json || '[]') } catch {}
  let results: Record<string, number> = {}
  try { results = JSON.parse((pollRow as any).results_json || '{}') } catch {}
  
  console.log('📊 Dati sondaggio:', { question, options, results })
  
  const sorted = Object.entries(results).sort((a, b) => (b[1] as number) - (a[1] as number))
  const winning = sorted.length ? sorted[0][0] : null
  const summary = sorted.length ? sorted.map(([o, c]) => `${o}: ${c}`).join(', ') : null
  
  console.log('🏆 Risultati elaborati:', { winning, summary })
  
  await applyDecisionFromAI(ctx, { question, options, winning, resultsSummary: summary, rulesText })
}

async function applyDecisionFromAI(ctx: Context, params: { question: string; options?: string[]; winning?: string | null; resultsSummary?: string | null; rulesText?: string }) {
  console.log('🤖 applyDecisionFromAI chiamata con parametri:', params)
  
  const rules = params.rulesText || (await rulesGetAll()).map((r: any) => `${r.rule_number}. ${r.content}`).join('\n\n')
  console.log('📚 Regole per AI (primi 200 caratteri):', rules.substring(0, 200) + '...')
  
  // Fallback immediato senza AI se richiesto da env (debug/affidabilità)
  const applyWithoutAI = `${process.env.APPLY_WITHOUT_AI || ''}`.toLowerCase()
  if (applyWithoutAI === '1' || applyWithoutAI === 'true') {
    console.log('🧩 APPLY_WITHOUT_AI attivo: applicazione regola con heuristics')
    let action: 'add' | 'update' | 'remove' = 'add'
    let rule_number: number | null = null
    let proposed_content: string | null = null
    const normalizedQuestion = params.question.replace(/\s+/g, ' ').trim()
    const normalizedWinning = (params.winning || '').replace(/\s+/g, ' ').trim()
    const maxMatch = normalizedWinning.toLowerCase().match(/(massimo|max|limite|\b([0-9]{1,2})\b)/)
    const noneMatch = /(nessuno|no)/i.test(normalizedWinning)
    const subject = normalizedQuestion
      .replace(/^quanti\s+/i, '')
      .replace(/^quante\s+/i, '')
      .replace(/^aggiungiamo\s+/i, '')
      .replace(/^limite\s+agli?\s+/i, '')
      .replace(/\?+$/, '')
      .trim()
    if (noneMatch) {
      proposed_content = `Non è consentito ${subject.toLowerCase()}.`
    } else {
      const numberMatch = normalizedWinning.match(/\b(\d{1,2})\b/)
      if (numberMatch) {
        const n = parseInt(numberMatch[1])
        proposed_content = `È consentito al massimo ${n} ${subject.toLowerCase()}.`
      } else if (maxMatch) {
        proposed_content = `È introdotto un limite relativo a: ${subject.toLowerCase()} (decisione: ${normalizedWinning}).`
      } else {
        proposed_content = `Nuova regola: ${normalizedQuestion} — Decisione: ${normalizedWinning || 'approvata'}.`
      }
    }
    if (rule_number == null) rule_number = await rulesNextNumber()
    console.log('💾 Salvo regola (no-AI):', { rule_number, proposed_content })
    const existedBefore = await ruleExists(rule_number as number)
    const ok = await rulesUpsert(rule_number as number, proposed_content as string)
    if (!ok) return (ctx as any).reply('❌ Errore durante il salvataggio della regola.')
    const verb = existedBefore ? 'aggiornata' : 'aggiunta'
    await (ctx as any).reply(`✅ Regola ${rule_number} ${verb} con successo.`)
    if (existedBefore) await (ctx as any).reply(`📋 Regola ${rule_number} aggiornata:\n\n${proposed_content}`, { parse_mode: 'Markdown' })
    else await (ctx as any).reply(`📋 Nuova regola ${rule_number}:\n\n${proposed_content}`, { parse_mode: 'Markdown' })
    return
  }

  try {
    console.log('🤖 Chiamata AI con parametri:', {
      question: params.question,
      options: params.options,
      winning: params.winning,
      resultsSummary: params.resultsSummary,
      rulesLength: rules.length
    })
    
    const toolCalls = await decideRuleActionWithTools({
      poll_question: params.question,
      poll_options: params.options,
      winning_option: params.winning,
      poll_result_summary: params.resultsSummary,
      rules_text: rules,
      model: 'gpt-4o'
    })
    
      console.log('🔧 Tool calls:', toolCalls.length)
    
    let action: 'add' | 'update' | 'remove' | null = null
    let rule_number: number | null = null
    let proposed_content: string | null = null
    
    // Analizza tutti i tool calls per trovare un'azione valida
    for (const call of toolCalls as any[]) {
      const name = call.name
      const args = call.arguments || {}
      // Debug sintetico
      console.log('🔍 Tool call:', name)
      
      if (name === 'remove_rule') { 
        action = 'remove'; 
        rule_number = args.rule_number; 
        console.log('✅ Rimozione rilevata:', { action, rule_number })
        break 
      }
      if (name === 'update_rule') { 
        action = 'update'; 
        rule_number = args.rule_number; 
        proposed_content = args.content; 
        console.log('✅ Aggiornamento rilevato:', { action, rule_number, proposed_content })
        break 
      }
      if (name === 'add_rule') { 
        action = 'add'; 
        rule_number = args.rule_number; 
        proposed_content = args.content; 
        console.log('✅ Aggiunta rilevata:', { action, rule_number, proposed_content })
        break 
      }
    }
    
    console.log('🎯 Azione:', action, 'Regola:', rule_number)
    
    // Se non c'è azione, prova a interpretare il contesto e forzare una decisione
    if (!action) {
      console.log('⚠️ Nessuna azione determinata dall\'AI, attivo sistema di fallback...')
      
      const question = params.question.toLowerCase()
      const winning = params.winning?.toLowerCase() || ''
      
      // Log sintetici
      console.log('🔍 Fallback attivo')
      
      // Logica di fallback migliorata
      const normalizedQuestion = params.question.replace(/\s+/g, ' ').trim()
      const normalizedWinning = (params.winning || '').replace(/\s+/g, ' ').trim()

      // Heuristics per estrarre limite da winning option
      const maxMatch = normalizedWinning.toLowerCase().match(/massimo\s+(\d+)/)
      const minMatch = normalizedWinning.toLowerCase().match(/minimo\s+(\d+)/)
      const noneMatch = /(nessuno|no)/i.test(normalizedWinning)

      if (/aboliamo|rimuoviamo|cancelliamo/i.test(question) || (/(teniamo|manteniamo)/i.test(question) && noneMatch)) {
        action = 'remove'
        // Prova a dedurre numero regola correlata
        const relevantRules = rules.split('\n').filter((r) => r.toLowerCase().includes(question.split(' ').find((w) => w.length > 3) || ''))
        if (relevantRules.length > 0) {
          const firstRule = relevantRules[0]
          const m = firstRule.match(/^(\d+)\./)
          if (m) rule_number = parseInt(m[1])
        }
        //
      } else if (/cambiamo|modifichiamo|aggiorniamo/i.test(question)) {
        action = 'update'
        proposed_content = `Regola aggiornata in base al sondaggio: ${normalizedQuestion}`
        //
      } else {
        action = 'add'
        // Genera contenuto testuale coerente
        const subject = normalizedQuestion.replace(/^quanti\s+/i, '').replace(/^limite\s+agli?\s+/i, '').replace(/\?+$/, '').trim()
        if (noneMatch) {
          proposed_content = `Non è consentito ${subject.toLowerCase()}.`
        } else if (maxMatch) {
          const n = parseInt(maxMatch[1])
          proposed_content = `È consentito al massimo ${n} ${subject.toLowerCase()}.`
        } else if (minMatch) {
          const n = parseInt(minMatch[1])
          proposed_content = `È obbligatorio avere almeno ${n} ${subject.toLowerCase()}.`
        } else {
          // fallback minimale
          proposed_content = `Nuova regola: ${normalizedQuestion} — Decisione: ${normalizedWinning || 'approvata'}.`
        }
        //
      }
      console.log('🎯 Fallback → Azione:', action)
    }

    if (action === 'remove') {
      if (rule_number == null) return (ctx as any).reply('❌ Sondaggio di rimozione senza numero di regola.')
      const existed = await ruleExists(rule_number)
      if (!existed) return (ctx as any).reply(`ℹ️ La regola ${rule_number} non esiste già. Nessuna rimozione effettuata.`)
      await rulesDelete(rule_number)
      return (ctx as any).reply(`✅ Regola ${rule_number} rimossa con successo.`)
    }

    if (rule_number == null && action === 'add') rule_number = await rulesNextNumber()
    
    // Controllo finale per proposed_content
    if (!proposed_content && (action === 'add' || action === 'update')) {
      console.log('⚠️ proposed_content ancora null, creo contenuto di fallback...')
      proposed_content = `Regola creata dal sondaggio: ${params.question}`
    }
    
    console.log('💾 Salvataggio regola…')
    
    if (!proposed_content) return (ctx as any).reply('❌ Nessun contenuto proposto trovato. Rendi più chiara la domanda/risposta.')
    
    console.log('💾 Salvo regola:', { rule_number, proposed_content })
    const existedBefore = await ruleExists(rule_number as number)
    const ok = await rulesUpsert(rule_number as number, proposed_content)
    if (!ok) return (ctx as any).reply('❌ Errore durante il salvataggio della regola.')
    const verb = existedBefore ? 'aggiornata' : 'aggiunta'
    await (ctx as any).reply(`✅ Regola ${rule_number} ${verb} con successo.`)
    if (existedBefore) await (ctx as any).reply(`📋 Regola ${rule_number} aggiornata:\n\n${proposed_content}`, { parse_mode: 'Markdown' })
    else await (ctx as any).reply(`📋 Nuova regola ${rule_number}:\n\n${proposed_content}`, { parse_mode: 'Markdown' })
    
  } catch (error) {
    console.error('❌ Errore in applyDecisionFromAI:', error)
    await (ctx as any).reply('❌ Errore durante l\'elaborazione AI. Riprova più tardi.')
  }
}

export async function handler(event: { body?: string }) {
  console.log('🚀 Webhook handler chiamato')
  console.log('📥 Event body:', event.body ? event.body.substring(0, 200) + '...' : 'undefined')
  
  try {
    ensureBot()
    const update = event.body ? JSON.parse(event.body) : {}
    console.log('📋 Update parsato:', JSON.stringify(update, null, 2))
    
    await (bot as Telegraf).handleUpdate(update)
    console.log('✅ Update gestito con successo')
    
    return { statusCode: 200, body: JSON.stringify({ ok: true }) }
  } catch (error) {
    console.error('❌ Errore nel webhook handler:', error)
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        ok: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }) 
    }
  }
}


