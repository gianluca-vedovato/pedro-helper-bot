import { Telegraf } from 'telegraf'
import type { Context } from 'telegraf'
import { askAboutRules, applyPollToRules } from './services/ai'
import { getSupabase, rulesGetAll } from './services/db'
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
      if (!arg) return ctx.reply('Uso: /promemoria_cancella <id>')
      const supabase = getSupabase()
      if (!supabase) return ctx.reply('DB non configurato.')
      const { error } = await supabase.from('reminders').delete().eq('id', arg).eq('chat_id', chat_id)
      if (error) return ctx.reply('❌ Errore nella cancellazione del promemoria.')
      return ctx.reply('✅ Promemoria cancellato.')
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
        await ctx.reply(text, {
          reply_markup: {
            inline_keyboard: [[{ text: 'Applica', callback_data: `applica_poll:${snapshot.poll_id}` }]]
          }
        })
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
            const text = buildPollRegisteredText(snapshot.poll_id, snapshot.question, snapshot.options)
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
    `🆔 ID: ${pollId}\n`,
    '💡 Per applicare i risultati:',
    '• Rispondi a questo messaggio con /applica_sondaggio',
    `• Oppure usa /applica_sondaggio ${pollId}\n`,
    '⚠️ Solo gli amministratori possono applicare i risultati.'
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

export default async function handler(req: any, res: any) {
  try {
    console.log('🚀 Webhook ricevuto:', req.method, req.url)
    
    if (req.method === 'POST') {
      const bot = ensureBot()
      if (!bot) {
        console.error('❌ Bot non inizializzato')
        return res.status(500).json({ error: 'Bot non inizializzato' })
      }

      const update = req.body
      console.log('📨 Update ricevuto:', update?.update_id ? `ID: ${update.update_id}` : 'No ID')
      
      await bot.handleUpdate(update)
      console.log('✅ Update gestito con successo')
      
      return res.status(200).json({ ok: true })
    } else {
      console.log('ℹ️ Richiesta GET ricevuta')
      return res.status(200).json({ 
        status: 'Bot attivo',
        timestamp: new Date().toISOString(),
          commands: ['/start', '/help', '/regolamento', '/askpedro', '/promemoria', '/promemoria_lista', '/promemoria_cancella', '/applica_sondaggio']
      })
    }
  } catch (error) {
    console.error('❌ Errore nel webhook:', error)
    return res.status(500).json({ error: 'Errore interno del server' })
  }
}


