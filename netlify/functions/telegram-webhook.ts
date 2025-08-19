import { Telegraf } from 'telegraf'
import type { Context } from 'telegraf'
import { askAboutRules, applyPollToRules, generateRuleContent } from './services/ai'
import { getSupabase, rulesGetAll, rulesUpsert, rulesDelete } from './services/db'
import { pollsUpsert, pollGetById } from './services/db'

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
      await ctx.reply('Ciao! Sono Pedro (Node). Comandi:\n/regolamento [n]\n/askpedro [domanda]\n/promemoria, /promemoria_lista, /promemoria_cancella\n/crea_regola [tema], /cancella_regola')
    })

    bot.help(async (ctx) => {
      console.log('❓ Comando /help ricevuto')
      await ctx.reply('Comandi:\n/start\n/help\n/regolamento [numero]\n/askpedro [domanda]\n/promemoria <testo>\n/promemoria_lista\n/promemoria_cancella <id>\n/crea_regola <numero> <tema>\n/cancella_regola <numero>')
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
      if (!arg) return ctx.reply('Uso: /promemoria_cancella <id>')
      const supabase = getSupabase()
      if (!supabase) return ctx.reply('DB non configurato.')
      const { error } = await supabase.from('reminders').delete().eq('id', arg).eq('chat_id', chat_id)
      if (error) return ctx.reply('❌ Errore nella cancellazione del promemoria.')
      return ctx.reply('✅ Promemoria cancellato.')
    })

    bot.command('crea_regola', async (ctx) => {
      console.log('📝 Comando /crea_regola ricevuto')
      const args = (ctx.message?.text || '').split(' ').slice(1)
      if (args.length < 2) {
        return ctx.reply('❌ Uso: /crea_regola <numero> <tema>\n\nEsempio:\n/crea_regola 1 "formazione squadra"\n\n🤖 L\'AI genererà automaticamente il contenuto della regola!')
      }
      
      const ruleNumber = Number(args[0])
      const topic = args.slice(1).join(' ')
      
      if (!Number.isInteger(ruleNumber) || ruleNumber <= 0) {
        return ctx.reply('❌ Il numero della regola deve essere un numero intero positivo.')
      }
      
      if (topic.length < 3) {
        return ctx.reply('❌ Il tema della regola deve essere di almeno 3 caratteri.')
      }
      
      const chatId = ctx.chat?.id as number
      const userId = ctx.from?.id as number
      const isAdmin = await userIsAdmin(ctx, chatId, userId)
      
      if (!isAdmin) {
        return ctx.reply('❌ Solo gli amministratori possono creare regole.')
      }
      
      try {
        // Mostra messaggio di "generazione in corso"
        const processingMsg = await ctx.reply('🤖 Sto generando la regola con l\'AI...')
        
        // Ottieni le regole esistenti per il contesto
        const existingRules = await rulesGetAll()
        const existingRulesText = existingRules.length > 0 
          ? existingRules.map((r: any) => `${r.rule_number}. ${r.content}`).join('\n')
          : 'Nessuna regola esistente'
        
        // Genera il contenuto della regola con l'AI
        const generatedContent = await generateRuleContent(ruleNumber, topic, existingRulesText)
        
        // Salva la regola generata
        const success = await rulesUpsert(ruleNumber, generatedContent)
        
        if (success) {
          // Elimina il messaggio di "generazione in corso"
          await ctx.telegram.deleteMessage(chatId, processingMsg.message_id)
          
          return ctx.reply(`✅ Regola ${ruleNumber} generata e salvata con successo!\n\n📋 Contenuto generato dall'AI:\n"${generatedContent}"\n\n💡 Tema richiesto: "${topic}"`)
        } else {
          // Elimina il messaggio di "generazione in corso"
          await ctx.telegram.deleteMessage(chatId, processingMsg.message_id)
          return ctx.reply('❌ Errore durante il salvataggio della regola generata.')
        }
      } catch (error) {
        console.error('Errore creazione regola con AI:', error)
        return ctx.reply(`❌ Errore durante la generazione della regola: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`)
      }
    })

    bot.command('cancella_regola', async (ctx) => {
      console.log('🗑️ Comando /cancella_regola ricevuto')
      const arg = (ctx.message?.text || '').split(' ').slice(1)[0]
      
      if (!arg) {
        return ctx.reply('❌ Uso: /cancella_regola <numero>\n\nEsempio:\n/cancella_regola 5')
      }
      
      const ruleNumber = Number(arg)
      if (!Number.isInteger(ruleNumber) || ruleNumber <= 0) {
        return ctx.reply('❌ Il numero della regola deve essere un numero intero positivo.')
      }
      
      const chatId = ctx.chat?.id as number
      const userId = ctx.from?.id as number
      const isAdmin = await userIsAdmin(ctx, chatId, userId)
      
      if (!isAdmin) {
        return ctx.reply('❌ Solo gli amministratori possono cancellare regole.')
      }
      
      try {
        const success = await rulesDelete(ruleNumber)
        if (success) {
          return ctx.reply(`✅ Regola ${ruleNumber} cancellata con successo!`)
        } else {
          return ctx.reply('❌ Errore durante la cancellazione della regola.')
        }
      } catch (error) {
        console.error('Errore cancellazione regola:', error)
        return ctx.reply('❌ Errore interno durante la cancellazione della regola.')
      }
    })



    // ======== SONDAGGI ========
    bot.on('message', async (ctx) => {
      const msg: any = ctx.message
      if (!msg || !msg.poll) return
      try {
        const poll = msg.poll
        const chatId = ctx.chat?.id as number
        const messageId = msg.message_id as number
        const snapshot = {
          poll_id: poll.id as string,
          chat_id: chatId,
          message_id: messageId,
          question: String(poll.question || ''),
          options: (poll.options || []).map((o: any) => ({ text: o.text, voter_count: o.voter_count || 0 })),
          is_closed: Boolean(poll.is_closed)
        }
        await pollsUpsert(snapshot)
        const text = buildPollRegisteredText(snapshot.poll_id, snapshot.question, snapshot.options)
        await ctx.reply(text)
      } catch (e) {
        console.error('Errore gestione messaggio sondaggio:', e)
      }
    })

    bot.on('poll', async (ctx) => {
      try {
        const update: any = (ctx as any).update
        const poll = update?.poll
        if (!poll) return
        const snapshot = {
          poll_id: poll.id as string,
          chat_id: 0, // sconosciuto in questo update; lo recuperiamo dal DB
          message_id: 0,
          question: String(poll.question || ''),
          options: (poll.options || []).map((o: any) => ({ text: o.text, voter_count: o.voter_count || 0 })),
          is_closed: Boolean(poll.is_closed)
        }
        const existing = await pollGetById(snapshot.poll_id)
        if (existing) {
          await pollsUpsert({ ...snapshot, chat_id: existing.chat_id, message_id: existing.message_id })
          if (snapshot.is_closed) {
            const text = buildPollClosedText(snapshot.poll_id, snapshot.question, snapshot.options)
            await ctx.telegram.sendMessage(existing.chat_id, text, {
              reply_markup: {
                inline_keyboard: [[{ text: 'Applica', callback_data: `applica_poll:${snapshot.poll_id}` }]]
              }
            })
          }
        }
      } catch (e) {
        console.error('Errore update poll:', e)
      }
    })

    bot.command('applica_sondaggio', async (ctx) => {
      try {
        const chatId = ctx.chat?.id as number
        const userId = ctx.from?.id as number
        const arg = (ctx.message?.text || '').split(' ').slice(1)[0]
        let pollId = arg
        if (!pollId) {
          const replied: any = (ctx.message as any)?.reply_to_message
          if (replied && replied.text) pollId = extractPollIdFromText(replied.text)
        }
        if (!pollId) return ctx.reply('Uso: /applica_sondaggio <poll_id> (oppure rispondi al messaggio di registrazione)')
        const isAdmin = await userIsAdmin(ctx, chatId, userId)
        if (!isAdmin) return ctx.reply('❌ Solo gli amministratori possono applicare i risultati.')
        const snapshot = await pollGetById(pollId)
        if (!snapshot) return ctx.reply('❌ Sondaggio non trovato nei registri.')
        const rules = await rulesGetAll()
        const rulesText = (rules as any[]).map((r) => `${r.rule_number}. ${r.content}`).join('\n\n')
        const result = await applyPollToRules({
          pollId: snapshot.poll_id,
          question: snapshot.question,
          options: snapshot.options,
          rulesText
        })
        await ctx.reply(result.summary)
      } catch (e) {
        console.error('Errore applica_sondaggio:', e)
        await ctx.reply('❌ Errore durante l\'applicazione del sondaggio.')
      }
    })

    bot.on('callback_query', async (ctx) => {
      try {
        const data = String((ctx.callbackQuery as any)?.data || '')
        if (!data.startsWith('applica_poll:')) return ctx.answerCbQuery()
        const pollId = data.split(':')[1]
        const chatId = ctx.chat?.id as number
        const userId = ctx.from?.id as number
        const isAdmin = await userIsAdmin(ctx, chatId, userId)
        if (!isAdmin) {
          await ctx.answerCbQuery('Solo gli amministratori possono applicare.', { show_alert: true })
          return
        }
        await ctx.answerCbQuery('Applico il sondaggio...')
        const snapshot = await pollGetById(pollId)
        if (!snapshot) return ctx.reply('❌ Sondaggio non trovato nei registri.')
        const rules = await rulesGetAll()
        const rulesText = (rules as any[]).map((r) => `${r.rule_number}. ${r.content}`).join('\n\n')
        const result = await applyPollToRules({ pollId, question: snapshot.question, options: snapshot.options, rulesText })
        await ctx.reply(result.summary)
      } catch (e) {
        console.error('Errore callback applica_poll:', e)
        await ctx.answerCbQuery('Errore durante l\'applicazione.', { show_alert: true })
      }
    })

    console.log('✅ Tutti i comandi configurati')
  } else {
    console.log('🤖 Bot già inizializzato')
  }
  return bot
}

function formatRule(content: string): string {
  return content.replace(/\*\*/g, '**').replace(/\n/g, '\n')
}

function buildPollRegisteredText(pollId: string, question: string, options: { text: string; voter_count: number }[]): string {
  const optionsText = options.map((o) => o.text).join(', ')
  return [
    '🗳️ Sondaggio registrato!\n',
    `📝 Domanda: ${question}`,
    `🔢 Opzioni: ${optionsText}`,
    `🆔 ID: ${pollId}`
  ].join('\n')
}

function buildPollClosedText(pollId: string, question: string, options: { text: string; voter_count: number }[]): string {
  const optionsText = options.map((o) => `${o.text} → ${o.voter_count} voti`).join('\n')
  const totalVotes = options.reduce((sum, o) => sum + o.voter_count, 0)
  const winningOptions = options.filter(o => o.voter_count === Math.max(...options.map(opt => opt.voter_count)))
  
  return [
    '🔒 Sondaggio chiuso!\n',
    `📝 Domanda: ${question}`,
    `🔢 Risultati (${totalVotes} voti totali):`,
    optionsText,
    `\n🏆 Opzione/i vincente/i:`,
    ...winningOptions.map(o => `• ${o.text} (${o.voter_count} voti)`),
    `\n🆔 ID: ${pollId}`,
    '\n💡 Per applicare i risultati, premi il pulsante "Applica" qui sotto.',
    '\n⚠️ Solo gli amministratori possono applicare i risultati.'
  ].join('\n')
}

async function userIsAdmin(ctx: Context, chatId: number, userId: number): Promise<boolean> {
  try {
    if (!chatId || !userId) return false
    const admins = await ctx.telegram.getChatAdministrators(chatId)
    return admins.some((a) => a.user.id === userId)
  } catch (e) {
    console.error('Errore verifica admin:', e)
    return false
  }
}

function extractPollIdFromText(text: string): string | '' {
  const m = text.match(/ID:\s*(\w+)/)
  return (m && m[1]) || ''
}



export async function handler(event: any) {
  try {
    const method = event?.httpMethod || event?.method || (event?.body ? 'POST' : 'GET')
    const url = event?.rawUrl || event?.path || ''
    console.log('🚀 Webhook ricevuto:', method, url)

    if (method === 'POST') {
      const bot = ensureBot()
      if (!bot) {
        console.error('❌ Bot non inizializzato')
        return {
          statusCode: 500,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ error: 'Bot non inizializzato' })
        }
      }

      const rawBody = event?.body
      const update = typeof rawBody === 'string' ? safeJsonParse(rawBody) : rawBody
      console.log('📨 Update ricevuto:', update?.update_id ? `ID: ${update.update_id}` : 'No ID')

      await bot.handleUpdate(update)
      console.log('✅ Update gestito con successo')

      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok: true }) }
    } else {
      console.log('ℹ️ Richiesta GET ricevuta')
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'Bot attivo',
          timestamp: new Date().toISOString(),
          commands: ['/start', '/help', '/regolamento', '/askpedro', '/promemoria', '/promemoria_lista', '/promemoria_cancella', '/crea_regola', '/cancella_regola', '/applica_sondaggio']
        })
      }
    }
  } catch (error) {
    console.error('❌ Errore nel webhook:', error)
    return { statusCode: 500, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'Errore interno del server' }) }
  }
}

function safeJsonParse(body: string): any {
  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}


