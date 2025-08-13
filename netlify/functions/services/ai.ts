import OpenAI from 'openai'

let client: OpenAI | null = null

function isVerbose(): boolean {
  const v = `${process.env.LOG_VERBOSE || process.env.DEBUG || ''}`.toLowerCase()
  return v === '1' || v === 'true' || v.includes('verbose')
}

const verbose = isVerbose()

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('Missing OPENAI_API_KEY')
    client = new OpenAI({ apiKey })
  }
  return client
}

export async function askAboutRules(question: string, rulesText: string, model = process.env.OPENAI_MODEL || 'gpt-4o-mini') {
  const prompt = `Sei un assistente esperto di fantacalcio. Rispondi alla seguente domanda basandoti SOLO sul regolamento fornito.\n\nRegolamento:\n${rulesText}\n\nDomanda: ${question}\n\nRispondi in italiano in modo chiaro e conciso, citando le regole specifiche quando possibile. Se la domanda non riguarda il regolamento, rispondi semplicemente "Non nel regolamento".`
  const openai = getClient()
  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: 'Sei un assistente esperto di fantacalcio che risponde solo in base al regolamento fornito.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 500
  })
  return resp.choices?.[0]?.message?.content?.trim() || 'Errore nella risposta.'
}

export async function decideRuleActionWithTools(args: {
  poll_question: string
  poll_options?: string[]
  rules_text: string
  winning_option?: string | null
  poll_result_summary?: string | null
  model?: string
}) {
  // Schemi condivisi per compatibilità con latest-model custom tools (parameters/input_schema)
  const addSchema: any = {
    type: 'object',
    properties: {
      rule_number: { type: 'integer' },
      content: { type: 'string' }
    },
    required: ['content'],
    additionalProperties: false
  }
  const updateSchema: any = {
    type: 'object',
    properties: {
      rule_number: { type: 'integer' },
      content: { type: 'string' }
    },
    required: ['rule_number', 'content'],
    additionalProperties: false
  }
  const removeSchema: any = {
    type: 'object',
    properties: {
      rule_number: { type: 'integer' }
    },
    required: ['rule_number'],
    additionalProperties: false
  }

  const tools: OpenAI.ChatCompletionTool[] = [
    {
      type: 'function',
      function: {
        name: 'add_rule',
        description: 'Aggiungi una nuova regola (se non esiste già una regola sullo stesso tema).',
        parameters: addSchema
      }
    },
    {
      type: 'function',
      function: {
        name: 'update_rule',
        description: 'Aggiorna una regola esistente con un nuovo testo completo (sostitutivo).',
        parameters: updateSchema
      }
    },
    {
      type: 'function',
      function: {
        name: 'remove_rule',
        description: 'Rimuovi una regola esistente.',
        parameters: removeSchema
      }
    }
  ]
  // Duplico le definizioni come "functions" per massima compatibilità con Chat Completions
  const functionsDef: any[] = [
    { name: 'add_rule', description: 'Aggiungi una nuova regola (se non esiste già una regola sullo stesso tema).', parameters: addSchema },
    { name: 'update_rule', description: 'Aggiorna una regola esistente con un nuovo testo completo (sostitutivo).', parameters: updateSchema },
    { name: 'remove_rule', description: 'Rimuovi una regola esistente.', parameters: removeSchema }
  ]
  const system_msg = `Sei un assistente per la gestione di regolamenti del fantacalcio. DEVI rispondere SOLO usando una delle funzioni (add_rule, update_rule, remove_rule). Non fornire MAI testo libero.

Quando ricevi un sondaggio, devi:
1. Analizzare la domanda e le opzioni
2. Capire l'intento dei partecipanti
3. Decidere se aggiungere, modificare o rimuovere una regola
4. Creare il testo della nuova regola o della modifica

Per fare questo, devi sempre usare una delle tre funzioni disponibili:
- add_rule: per creare nuove regole o stabilire nuovi limiti
- update_rule: per modificare regole esistenti
- remove_rule: per rimuovere regole quando i partecipanti votano per abolirle

Esempi di come interpretare i sondaggi:
- "Mettiamo un massimo di francesi in squadra?" con opzione "massimo 2" → add_rule per creare un limite di 2 giocatori francesi
- "Aboliamo la regola sui bonus?" con voto "sì" → remove_rule per rimuovere la regola esistente
- "Cambiamo il bonus gol da 3 a 5 punti?" → update_rule per modificare la regola esistente

 Il tuo obiettivo è rendere il regolamento sempre più chiaro e completo, seguendo le decisioni dei partecipanti.

 Regole di output:
 - Chiama ESATTAMENTE UNA funzione tra: add_rule, update_rule, remove_rule
 - Se il quesito riguarda introdurre un limite numerico, usa add_rule con content testuale completo
 - Se si chiede di abolire una regola, usa remove_rule con il rule_number se disponibile
 - Se si chiede di modificare una regola esistente, usa update_rule
 - Se incerto, scegli add_rule con un content ragionevole basato su domanda/opzione vincente`
  const user_msg = `Analizza il seguente sondaggio e decidi come aggiornare il regolamento. NON restituire testo libero: usa una sola funzione (add_rule, update_rule o remove_rule).

Domanda: ${args.poll_question}
Opzioni disponibili: ${(args.poll_options || []).join(', ')}
Risposta vincente: ${args.winning_option || 'sconosciuto'}
Risultati completi: ${args.poll_result_summary || 'n.d.'}

Regolamento attuale:
${args.rules_text}

 Linee guida:
 - Se l'opzione vincente contiene un numero (es. "massimo 2" o "1"), crea una nuova regola descrittiva con quel limite
 - Se la domanda contiene parole come "aboliamo", usa remove_rule
 - Se contiene "modifichiamo", "aggiorniamo", usa update_rule
 - Altrimenti, preferisci add_rule con content ben scritto`
  const openai = getClient()
  
  console.log('🤖 AI - Parametri ricevuti:', {
    poll_question: args.poll_question,
    poll_options: args.poll_options,
    winning_option: args.winning_option,
    poll_result_summary: args.poll_result_summary,
    rules_text_length: args.rules_text.length
  })
  
  console.log('🤖 AI - System message:', system_msg.substring(0, 200) + '...')
  console.log('🤖 AI - User message:', user_msg.substring(0, 200) + '...')
  
  // Preferisci le Responses API per modelli più nuovi (es. gpt-5), con fallback a Chat Completions
  const model = args.model || process.env.OPENAI_MODEL || 'gpt-4o'
  let result: Array<{ name?: string; arguments?: any }> = []
  
  // Usa Chat Completions per tutti i modelli gpt-4 (incluso gpt-4o)
  const isGpt4 = /^gpt-4/i.test(model)

  try {
    // 1) Primo tentativo: Chat Completions con functions (function_call:required su funzione determinata dal modello)
    if (isGpt4) {
      const respFunc = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system_msg },
          { role: 'user', content: user_msg }
        ],
        functions: functionsDef as any,
        function_call: 'auto' as any,
        max_tokens: 400,
        temperature: 0
      } as any)
      if (verbose) console.log('🤖 AI - Chat Completions raw (functions):', JSON.stringify(respFunc, null, 2))
      const fc = respFunc.choices?.[0]?.message?.function_call as any
      if (fc?.name) {
        let parsedArgs: any = {}
        try { parsedArgs = fc.arguments ? JSON.parse(fc.arguments) : {} } catch {}
        const mapped = [{ name: fc.name, arguments: parsedArgs }]
        console.log('🤖 AI - Function call (functions):', mapped.length)
        return mapped
      }

      // 2) Secondo tentativo: Chat Completions con tools (tool_choice:required)
      const respCC = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: system_msg },
          { role: 'user', content: user_msg }
        ],
        tools,
        tool_choice: 'required',
        max_tokens: 400,
        temperature: 0
      })
      if (verbose) console.log('🤖 AI - Chat Completions raw (gpt-4):', JSON.stringify(respCC, null, 2))
      const tcalls = respCC.choices?.[0]?.message?.tool_calls || []
      console.log('🤖 AI - Tool calls (gpt-4):', tcalls.length)
      result = tcalls.map((t) => {
        let parsed: any
        try { parsed = JSON.parse(t.function?.arguments || '{}') } catch { parsed = {} }
        const mapped = { name: t.function?.name, arguments: parsed }
        if (verbose) console.log('🤖 AI - Tool call mappato (chat gpt-4):', mapped)
        return mapped
      })
    } else {
      // 3) Responses API (modelli più nuovi)
      const resp = await openai.responses.create({
      model,
      input: [
        { role: 'system', content: [{ type: 'text', text: system_msg }] },
        { role: 'user', content: [{ type: 'text', text: user_msg }] }
      ],
      tools: tools as any,
        tool_choice: 'required' as any,
      parallel_tool_calls: false,
      max_output_tokens: 500,
      temperature: 0
      } as any)
      
      if (verbose) console.log('🤖 AI - Responses API raw:', JSON.stringify(resp, null, 2))
      const output = (resp as any)?.output || []
      
      // Estrazione robusta dei tool calls (diverse forme supportate nei modelli recenti)
      const collected: any[] = []
      for (const item of output) {
        if (item?.type === 'tool_call') collected.push(item)
        if (item?.type === 'message' && Array.isArray(item.tool_calls)) {
          for (const tc of item.tool_calls) collected.push(tc)
        }
        const content = item?.content
        if (Array.isArray(content)) {
          for (const part of content) if (part?.type === 'tool_call') collected.push(part)
        }
      }
      console.log('🤖 AI - Tool calls (responses):', collected.length)
      if (collected.length > 0) {
        result = collected.map((tc: any) => {
          const rawArgs = tc.arguments ?? tc.args ?? tc.input
          let parsed: any = {}
          try { parsed = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs || {} } catch {}
          const name = tc.name || tc.tool_name
          const mapped = { name, arguments: parsed }
          if (verbose) console.log('🤖 AI - Tool call mappato (responses):', mapped)
          return mapped
        })
      } else {
        if (verbose) console.log('⚠️ Nessun tool_call in Responses (input). Ritento con messages...')
        const respAlt = await openai.responses.create({
          model,
          messages: [
            { role: 'system', content: [{ type: 'text', text: system_msg }] },
            { role: 'user', content: [{ type: 'text', text: user_msg }] }
          ],
          tools: tools as any,
          tool_choice: 'required' as any,
          parallel_tool_calls: false,
          max_output_tokens: 500,
          temperature: 0
        } as any)
        if (verbose) console.log('🤖 AI - Responses API raw (messages):', JSON.stringify(respAlt, null, 2))
        const outputAlt = (respAlt as any)?.output || []
        const collectedAlt: any[] = []
        for (const item of outputAlt) {
          if (item?.type === 'tool_call') collectedAlt.push(item)
          if (item?.type === 'message' && Array.isArray(item.tool_calls)) {
            for (const tc of item.tool_calls) collectedAlt.push(tc)
          }
          const content = item?.content
          if (Array.isArray(content)) {
            for (const part of content) if (part?.type === 'tool_call') collectedAlt.push(part)
          }
        }
        console.log('🤖 AI - Tool calls (responses/messages):', collectedAlt.length)
        if (collectedAlt.length > 0) {
          result = collectedAlt.map((tc: any) => {
            const rawArgs = tc.arguments ?? tc.args ?? tc.input
            let parsed: any = {}
            try { parsed = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs || {} } catch {}
            const name = tc.name || tc.tool_name
            const mapped = { name, arguments: parsed }
            if (verbose) console.log('🤖 AI - Tool call mappato (responses/messages):', mapped)
            return mapped
          })
        } else {
          const textMsg = outputAlt.find((o: any) => o?.type === 'message')
          const text = textMsg?.content?.[0]?.text
          if (text && verbose) {
            console.log('⚠️ Responses (messages) ha restituito solo testo invece di tool calls!')
            console.log('⚠️ Contenuto ricevuto:', text)
          }
        }
      }
    }
  } catch (e) {
    if (verbose) console.log('⚠️ Responses API non disponibile o fallita, uso Chat Completions. Errore:', e instanceof Error ? e.message : e)
  }
  
  if (result.length === 0 && !isGpt4) {
    // Fallback: Chat Completions tools
    const respCC = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system_msg },
        { role: 'user', content: user_msg }
      ],
      tools,
      tool_choice: 'required',
      max_tokens: 500,
      temperature: 0
    })
    if (verbose) console.log('🤖 AI - Chat Completions raw:', JSON.stringify(respCC, null, 2))
    const tcalls = respCC.choices?.[0]?.message?.tool_calls || []
    console.log('🤖 AI - Tool calls (chat):', tcalls.length)
    if (tcalls.length === 0 && respCC.choices?.[0]?.message?.content && verbose) {
      console.log('⚠️ ChatCompletions ha restituito solo testo invece di tool calls!')
      console.log('⚠️ Contenuto ricevuto:', respCC.choices?.[0]?.message?.content)
    }
    result = tcalls.map((t) => {
      let parsed: any
      try { parsed = JSON.parse(t.function?.arguments || '{}') } catch { parsed = {} }
      const mapped = { name: t.function?.name, arguments: parsed }
      if (verbose) console.log('🤖 AI - Tool call mappato (chat):', mapped)
      return mapped
    })
  }
  
  if (verbose) console.log('🤖 AI - Risultato finale:', JSON.stringify(result, null, 2))
  return result
}


