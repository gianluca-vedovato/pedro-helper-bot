import OpenAI from 'openai'
import { rulesDelete, rulesNextNumber, rulesUpsert } from './db'

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY mancante')
  return new OpenAI({ apiKey })
}

export async function askAboutRules(question: string, rulesText: string): Promise<string> {
  try {
    console.log('🤖 AI: Chiamata askAboutRules per domanda:', question)
    console.log('🤖 AI: Regole disponibili:', rulesText ? 'Sì' : 'No')
    
    const openai = getClient()
    const model = process.env.OPENAI_MODEL || 'gpt-5'
    console.log('🤖 AI: Modello utilizzato:', model)
    
    const resp = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `Sei un assistente esperto di fantacalcio. La tua missione è rispondere alle domande basandoti ESCLUSIVAMENTE sul regolamento fornito.

REGOLAMENTO COMPLETO:
${rulesText}

ISTRUZIONI IMPORTANTI:
1. LEGGI ATTENTAMENTE ogni regola del regolamento fornito
2. ANALIZZA la domanda dell'utente per capire cosa sta chiedendo
3. CERCA NEL REGOLAMENTO la risposta specifica - quasi sicuramente troverai qualcosa di rilevante
4. Se trovi regole pertinenti, citala/e specificamente (es. "Secondo la regola X...")
5. Se la domanda non è coperta dal regolamento, dillo chiaramente
6. Sii preciso, conciso e sempre basato sulle regole scritte

RICORDA: Guarda molto bene nel regolamento - qualcosa trovi quasi sicuramente!`
        },
        {
          role: 'user',
          content: question
        }
      ],
      max_completion_tokens: 500
    })
    
    const content = resp.choices?.[0]?.message?.content?.trim()
    if (content) {
      console.log('✅ AI: Risposta generata con successo')
      return content
    } else {
      console.error('❌ AI: Nessuna risposta generata da OpenAI')
      return '❌ Non sono riuscito a generare una risposta. Assicurati di chiedere solo domande relative al regolamento fantacalcio.'
    }
  } catch (error) {
    console.error('❌ AI: Errore in askAboutRules:', error)
    return `❌ Errore nella generazione della risposta: ${error instanceof Error ? error.message : 'Errore sconosciuto'}. Assicurati di chiedere solo domande relative al regolamento fantacalcio.`
  }
}

export type PollOptionSnapshot = { text: string; voter_count: number }

export async function applyPollToRules(params: {
  pollId: string
  question: string
  options: PollOptionSnapshot[]
  rulesText: string
}): Promise<{ summary: string }> {
  const openai = getClient()

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'add_rule',
        description: 'Aggiunge una nuova regola al regolamento',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Testo completo della regola' },
            rule_number: { type: 'integer', description: 'Numero della regola, opzionale' }
          },
          required: ['content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_rule',
        description: 'Aggiorna una regola esistente',
        parameters: {
          type: 'object',
          properties: {
            rule_number: { type: 'integer' },
            content: { type: 'string' }
          },
          required: ['rule_number', 'content']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'delete_rule',
        description: 'Elimina una regola esistente',
        parameters: {
          type: 'object',
          properties: {
            rule_number: { type: 'integer' }
          },
          required: ['rule_number']
        }
      }
    }
  ]

  const winningOptions = pickWinningOptions(params.options)
  const userContent = [
    `Sondaggio: ${params.question}`,
    `Opzioni (testo → voti):`,
    ...params.options.map((o) => `- ${o.text} → ${o.voter_count}`),
    `\nOpzione/i vincente/i:`,
    ...winningOptions.map((o) => `- ${o.text} → ${o.voter_count}`),
    `\nRegolamento attuale:`,
    params.rulesText,
    `\nIn base ai risultati, scegli ed ESEGUI UNA SOLA azione tra: add_rule, update_rule, delete_rule.`,
    `Rispondi usando esclusivamente una chiamata funzione.`
  ].join('\n')

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-5',
    messages: [
      {
        role: 'system',
        content:
          'Sei un assistente che MODIFICA il regolamento in base ai risultati di un sondaggio. Usa UNA SOLA funzione tra: add_rule, update_rule, delete_rule.'
      },
      { role: 'user', content: userContent }
    ],
    tools,
    tool_choice: 'required'
  })

  const toolCalls = completion.choices?.[0]?.message?.tool_calls || []
  if (!toolCalls.length) return { summary: '❌ Nessuna modifica applicata.' }

  const call = toolCalls[0]
  const name = call.function?.name
  const args = safeParse(call.function?.arguments)
  if (!name) return { summary: '❌ Nessuna funzione selezionata.' }

  switch (name) {
    case 'add_rule': {
      const content = String(args.content || '').trim()
      if (!content) return { summary: '❌ add_rule: contenuto mancante.' }
      const number = Number.isInteger(args.rule_number) ? Number(args.rule_number) : await rulesNextNumber()
      const ok = await rulesUpsert(number, content)
      return { summary: ok ? `✅ Aggiunta regola ${number}` : '❌ Errore aggiunta regola' }
    }
    case 'update_rule': {
      const number = Number(args.rule_number)
      const content = String(args.content || '').trim()
      if (!Number.isInteger(number) || !content) return { summary: '❌ update_rule: parametri invalidi.' }
      const ok = await rulesUpsert(number, content)
      return { summary: ok ? `✅ Aggiornata regola ${number}` : '❌ Errore aggiornamento regola' }
    }
    case 'delete_rule': {
      const number = Number(args.rule_number)
      if (!Number.isInteger(number)) return { summary: '❌ delete_rule: numero non valido.' }
      const ok = await rulesDelete(number)
      return { summary: ok ? `✅ Eliminata regola ${number}` : '❌ Errore eliminazione regola' }
    }
    default:
      return { summary: '❌ Funzione non supportata.' }
  }
}

export async function generateRuleContent(ruleNumber: number, topic: string, existingRules: string): Promise<string> {
  try {
    console.log('🤖 AI: Chiamata generateRuleContent per regola:', ruleNumber, 'tema:', topic)
    
    const openai = getClient()
    const model = process.env.OPENAI_MODEL || 'gpt-5'
    console.log('🤖 AI: Modello utilizzato:', model)
    
    const prompt = `Sei un esperto di fantacalcio che scrive regole chiare e precise.

Regole esistenti nel regolamento:
${existingRules || 'Nessuna regola esistente'}

Devi creare la regola numero ${ruleNumber} sul tema: "${topic}"

Requisiti:
- La regola deve essere chiara, concisa e specifica
- Deve essere applicabile e non ambigua
- Deve integrarsi bene con le regole esistenti
- Deve essere scritta in italiano
- Lunghezza consigliata: 1-3 frasi

Genera SOLO il contenuto della regola, senza numerazione o formattazione aggiuntiva.`

    const resp = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'Sei un assistente esperto di fantacalcio che scrive regole chiare e precise per un regolamento.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_completion_tokens: 200
    })
    
    const content = resp.choices?.[0]?.message?.content?.trim()
    if (content) {
      console.log('✅ AI: Regola generata con successo')
      return content
    } else {
      console.error('❌ AI: Nessuna regola generata da OpenAI')
      throw new Error('Nessuna regola generata')
    }
  } catch (error) {
    console.error('❌ AI: Errore in generateRuleContent:', error)
    throw new Error(`Errore nella generazione della regola: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`)
  }
}

function safeParse(input?: string | null): any {
  if (!input) return {}
  try {
    return JSON.parse(input)
  } catch {
    return {}
  }
}

function pickWinningOptions(options: PollOptionSnapshot[]): PollOptionSnapshot[] {
  if (!options.length) return []
  const maxVotes = Math.max(...options.map((o) => o.voter_count))
  return options.filter((o) => o.voter_count === maxVotes)
}


