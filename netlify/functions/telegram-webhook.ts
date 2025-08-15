import { Telegraf } from 'telegraf'
import type { Context } from 'telegraf'
import { askAboutRules, applyPollToRules } from './services/ai'
import { getSupabase, rulesGetAll } from './services/db'
import { pollsUpsert, pollGetById, pollsGetOpenByChatId, pollsGetClosedByChatId } from './services/db'

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
      await ctx.reply('Ciao! Sono Pedro (Node). Comandi:\n/regolamento [n]\n/askpedro [domanda]\n/promemoria, /promemoria_lista, /promemoria_cancella\n/verifica_sondaggi')
    })

    bot.help(async (ctx) => {
      console.log('❓ Comando /help ricevuto')
      await ctx.reply('Comandi:\n/start\n/help\n/regolamento [numero]\n/askpedro [domanda]\n/promemoria <testo>\n/promemoria_lista\n/promemoria_cancella <id>\n/verifica_sondaggi')
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

    bot.command('verifica_sondaggi', async (ctx) => {
      console.log('🔍 Comando /verifica_sondaggi ricevuto')
      const chatId = ctx.chat?.id as number
      const userId = ctx.from?.id as number
      
      if (!chatId || !userId) {
        return ctx.reply('❌ Errore: chat o utente non identificato.')
      }
      
      const isAdmin = await userIsAdmin(ctx, chatId, userId)
      if (!isAdmin) {
        return ctx.reply('❌ Solo gli amministratori possono verificare i sondaggi.')
      }
      
      try {
        if (!bot) {
          return ctx.reply('❌ Errore: bot non inizializzato.')
        }
        await checkAndNotifyPolls(chatId, bot)
        await ctx.reply('✅ Verifica sondaggi completata!')
      } catch (e) {
        console.error('Errore verifica sondaggi:', e)
        await ctx.reply('❌ Errore durante la verifica dei sondaggi.')
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
        
        // Verifica se il bot è presente nel gruppo
        const isBotInGroup = await checkBotInGroup(chatId)
        
        if (isBotInGroup) {
          // Bot presente: registra il sondaggio alla creazione
          const snapshot = {
            poll_id: poll.id as string,
            chat_id: chatId,
            message_id: messageId,
            question: String(poll.question || ''),
            options: (poll.options || []).map((o: any) => ({ text: o.text, voter_count: o.voter_count || 0 })),
            is_closed: Boolean(poll.is_closed),
            created_at: new Date().toISOString()
          }
          await pollsUpsert(snapshot)
          const text = buildPollRegisteredText(snapshot.poll_id, snapshot.question, snapshot.options)
          await ctx.reply(text)
          console.log(`✅ Sondaggio ${poll.id} registrato alla creazione (bot presente)`)
        } else {
          // Bot non presente: registra solo se chiuso
          if (poll.is_closed) {
            const snapshot = {
              poll_id: poll.id as string,
              chat_id: chatId,
              message_id: messageId,
              question: String(poll.question || ''),
              options: (poll.options || []).map((o: any) => ({ text: o.text, voter_count: o.voter_count || 0 })),
              is_closed: true,
              created_at: new Date().toISOString()
            }
            await pollsUpsert(snapshot)
            console.log(`✅ Sondaggio ${poll.id} registrato alla chiusura (bot non presente)`)
          }
        }
      } catch (e) {
        console.error('Errore gestione messaggio sondaggio:', e)
      }
    })

    // Gestione quando il bot entra in un gruppo
    bot.on('new_chat_members', async (ctx) => {
      try {
        const newMembers = ctx.message?.new_chat_members || []
        const isBotAdded = newMembers.some((member: any) => member.id === bot?.botInfo?.id)
        
        if (isBotAdded && bot) {
          console.log('🤖 Bot aggiunto al gruppo:', ctx.chat?.id)
          const chatId = ctx.chat?.id as number
          
          // Verifica se ci sono sondaggi in questo gruppo
          await checkAndNotifyPolls(chatId, bot)
        }
      } catch (e) {
        console.error('Errore gestione new_chat_members:', e)
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
          // Aggiorna il sondaggio esistente
          await pollsUpsert({ ...snapshot, chat_id: existing.chat_id, message_id: existing.message_id })
          
          if (snapshot.is_closed) {
            const text = buildPollClosedText(snapshot.poll_id, snapshot.question, snapshot.options)
            
            try {
              // Prova a inviare il messaggio nel chat originale
              await ctx.telegram.sendMessage(existing.chat_id, text, {
                reply_markup: {
                  inline_keyboard: [[{ text: 'Applica', callback_data: `applica_poll:${snapshot.poll_id}` }]]
                }
              })
              console.log(`✅ Messaggio di chiusura inviato per il sondaggio ${snapshot.poll_id} nel chat ${existing.chat_id}`)
            } catch (sendError) {
              console.log(`❌ Impossibile inviare messaggio nel chat ${existing.chat_id}:`, sendError)
              console.log(`💾 Sondaggio ${snapshot.poll_id} chiuso ma non consegnato nel chat ${existing.chat_id}`)
            }
          }
        } else if (snapshot.is_closed) {
          // Sondaggio chiuso ma non registrato: potrebbe essere stato creato quando il bot non era presente
          // Cerchiamo di determinare il chat_id dal contesto dell'update
          let chatId = 0
          
          try {
            // Prova a ottenere informazioni sul chat dall'update
            if (update?.message?.chat?.id) {
              chatId = update.message.chat.id
            } else if (update?.callback_query?.message?.chat?.id) {
              chatId = update.callback_query.message.chat.id
            }
          } catch (e) {
            console.log('⚠️ Impossibile determinare il chat_id dall\'update')
          }
          
          if (chatId) {
            // Registra il sondaggio chiuso con il chat_id determinato
            const newSnapshot = { 
              ...snapshot, 
              chat_id: chatId, 
              message_id: 0,
              created_at: new Date().toISOString()
            }
            await pollsUpsert(newSnapshot)
            console.log(`✅ Sondaggio chiuso ${snapshot.poll_id} registrato retroattivamente per il chat ${chatId}`)
          } else {
            console.log(`⚠️ Sondaggio chiuso ${snapshot.poll_id} non può essere registrato (chat_id sconosciuto)`)
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

async function checkAndNotifyPolls(chatId: number, botInstance: Telegraf<Context>) {
  try {
    const openPolls = await pollsGetOpenByChatId(chatId)
    const closedPolls = await pollsGetClosedByChatId(chatId)
    
    if (openPolls.length === 0 && closedPolls.length === 0) {
      console.log(`📝 Nessun sondaggio trovato per il chat ${chatId}.`)
      return
    }

    console.log(`📝 ${openPolls.length} sondaggi aperti e ${closedPolls.length} chiusi trovati per il chat ${chatId}.`)
    
    // Invia un messaggio di benvenuto con informazioni sui sondaggi
    const welcomeText = [
      '🤖 Ciao! Sono Pedro, il bot per la gestione del regolamento fantacalcio.',
      '',
      `📝 Ho trovato ${openPolls.length} sondaggio/i aperto/i e ${closedPolls.length} chiuso/i in questo gruppo:`
    ]
    
    if (openPolls.length > 0) {
      welcomeText.push('', '🟢 Sondaggi aperti:')
      openPolls.forEach((poll, index) => {
        welcomeText.push(`${index + 1}. ${poll.question}`)
      })
    }
    
    if (closedPolls.length > 0) {
      welcomeText.push('', '🔴 Sondaggi chiusi:')
      closedPolls.forEach((poll, index) => {
        welcomeText.push(`${index + 1}. ${poll.question}`)
      })
      welcomeText.push('', '💡 I sondaggi chiusi possono essere applicati per aggiornare il regolamento.')
    }
    
    welcomeText.push('', '📚 Usa /regolamento per vedere le regole attuali.')
    
    await botInstance.telegram.sendMessage(chatId, welcomeText.join('\n'))
    
    // Se ci sono sondaggi chiusi, invia i messaggi di chiusura con i pulsanti per applicare
    for (const poll of closedPolls) {
      try {
        const text = buildPollClosedText(poll.poll_id, poll.question, poll.options)
        await botInstance.telegram.sendMessage(chatId, text, {
          reply_markup: {
            inline_keyboard: [[{ text: 'Applica', callback_data: `applica_poll:${poll.poll_id}` }]]
          }
        })
        console.log(`✅ Messaggio di chiusura inviato per il sondaggio ${poll.poll_id}`)
      } catch (sendError) {
        console.error(`❌ Errore nell'invio del messaggio per il sondaggio ${poll.poll_id}:`, sendError)
      }
    }
    
    // Se non ci sono sondaggi chiusi ma ci sono sondaggi aperti, invia solo il messaggio di benvenuto
    if (closedPolls.length === 0 && openPolls.length > 0) {
      const welcomeText = [
        '🤖 Ciao! Sono Pedro, il bot per la gestione del regolamento fantacalcio.',
        '',
        `📝 Ho trovato ${openPolls.length} sondaggio/i aperto/i in questo gruppo:`,
        ...openPolls.map((poll, index) => `${index + 1}. ${poll.question}`),
        '',
        '💡 Quando i sondaggi verranno chiusi, potrai applicare i risultati per aggiornare il regolamento.',
        '📚 Usa /regolamento per vedere le regole attuali.'
      ].join('\n')
      
      await botInstance.telegram.sendMessage(chatId, welcomeText)
    }
    
  } catch (e) {
    console.error('Errore nella notifica dei sondaggi:', e)
  }
}

async function checkBotInGroup(chatId: number): Promise<boolean> {
  try {
    if (!bot) return false
    const botInfo = await bot.telegram.getMe()
    if (!botInfo) return false
    const admins = await bot.telegram.getChatAdministrators(chatId)
    return admins.some((a) => a.user.id === botInfo.id)
  } catch (e) {
    console.error('Errore nella verifica del bot nel gruppo:', e)
    return false
  }
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
          commands: ['/start', '/help', '/regolamento', '/askpedro', '/promemoria', '/promemoria_lista', '/promemoria_cancella', '/applica_sondaggio', '/verifica_sondaggi']
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


