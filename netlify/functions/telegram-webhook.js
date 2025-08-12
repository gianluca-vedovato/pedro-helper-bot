// Netlify Function: Telegram webhook handler for Pedro (Node)
// Free deploy path: Netlify Functions (or Vercel/Cloudflare Workers variants)

import { Telegraf } from "telegraf";
import OpenAI from "openai";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Env vars: set in Netlify dashboard
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Lazy singletons across warm invocations
let bot;
let openai;
let supabase;

function ensureClients() {
  console.log("ensureClients called");
  console.log("BOT_TOKEN configured:", !!process.env.BOT_TOKEN);
  console.log("OPENAI_API_KEY configured:", !!process.env.OPENAI_API_KEY);
  console.log("SUPABASE_URL configured:", !!process.env.SUPABASE_URL);
  console.log("SUPABASE_ANON_KEY configured:", !!process.env.SUPABASE_ANON_KEY);

  if (!bot) {
    if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
    console.log("Creating Telegraf bot instance...");
    bot = new Telegraf(BOT_TOKEN);
    console.log("Telegraf bot instance created");

    // Commands
    bot.start(async (ctx) => {
      await ctx.reply(
        "Ciao! Sono Pedro (Node). Comandi:\n/regolamento [n]\n/askpedro [domanda]\n/promemoria, /promemoria_lista, /promemoria_cancella"
      );
    });

    bot.help(async (ctx) => {
      await ctx.reply(
        "Comandi:\n/start\n/help\n/regolamento [numero]\n/askpedro [domanda]\n/promemoria <testo>\n/promemoria_lista\n/promemoria_cancella <id>"
      );
    });

    bot.command("regolamento", async (ctx) => {
      const arg = (ctx.message?.text || "")
        .split(" ")
        .slice(1)
        .join(" ")
        .trim();
      const rules = await getAllRules();
      if (!rules.length) return ctx.reply("❌ Nessuna regola caricata.");
      if (arg) {
        const n = Number(arg);
        if (!Number.isInteger(n))
          return ctx.reply("❌ Numero regola non valido.");
        const found = rules.find((r) => r.rule_number === n);
        if (!found) return ctx.reply(`❌ Regola ${n} non trovata.`);
        return ctx.reply(`📋 Regola ${n}:\n\n${formatRule(found.content)}`, {
          parse_mode: "Markdown",
        });
      }
      // all rules
      let resp = "📚 Regolamento Completo:\n\n";
      for (const r of rules) {
        resp += `**${r.rule_number}.** ${formatRule(r.content)}\n\n`;
      }
      // Telegram 4096 char limit
      for (let i = 0; i < resp.length; i += 4096) {
        await ctx.reply(resp.slice(i, i + 4096), { parse_mode: "Markdown" });
      }
    });

    bot.command("askpedro", async (ctx) => {
      try {
        console.log("askpedro command received");
        const q = (ctx.message?.text || "")
          .split(" ")
          .slice(1)
          .join(" ")
          .trim();
        console.log("Question extracted:", q);

        if (!q) {
          console.log("No question provided");
          return ctx.reply("❌ Uso: /askpedro [domanda]");
        }

        console.log("Getting rules from database...");
        const rules = await getAllRules();
        console.log(`Retrieved ${rules.length} rules`);

        if (!rules.length) {
          console.log("No rules found in database");
          return ctx.reply("❌ Nessuna regola caricata.");
        }

        const rulesText = rules
          .map((r) => `${r.rule_number}. ${r.content}`)
          .join("\n\n");
        console.log("Rules text prepared, length:", rulesText.length);

        console.log("Calling OpenAI...");
        const answer = await askAboutRules(q, rulesText);
        console.log("OpenAI response received, length:", answer.length);

        await ctx.reply(`🤖 Pedro dice:\n\n${answer}`, {
          parse_mode: "Markdown",
        });
        console.log("Response sent successfully");
      } catch (e) {
        console.error("Error in askpedro command:", e);
        await ctx.reply("Errore AI, riprova più tardi.");
      }
    });

    bot.command("promemoria", async (ctx) => {
      const text = (ctx.message?.text || "")
        .split(" ")
        .slice(1)
        .join(" ")
        .trim();
      if (!text) return ctx.reply("Uso: /promemoria <testo>");
      const chat_id = ctx.chat?.id;
      const user = ctx.from || {};
      const user_name =
        user.username ||
        `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
        "Utente";
      const { data, error } = await supabase
        .from("reminders")
        .insert({ chat_id, user_id: user.id, user_name, text })
        .select("id")
        .single();
      if (error) return ctx.reply("❌ Errore nel salvataggio del promemoria.");
      return ctx.reply(`✅ Promemoria salvato (#${data.id})\n${text}`);
    });

    bot.command("promemoria_lista", async (ctx) => {
      const chat_id = ctx.chat?.id;
      const { data, error } = await supabase
        .from("reminders")
        .select("id,user_name,text,created_at")
        .eq("chat_id", chat_id)
        .order("id", { ascending: false });
      if (error) return ctx.reply("Errore nel recupero promemoria.");
      if (!data?.length)
        return ctx.reply("Nessun promemoria salvato per questo gruppo.");
      const lines = data.map(
        (r) => `${r.id}. ${r.text}\n   — ${r.user_name} • ${r.created_at}`
      );
      const response = `📝 Promemoria salvati:\n\n${lines.join("\n")}`;
      for (let i = 0; i < response.length; i += 4096) {
        await ctx.reply(response.slice(i, i + 4096));
      }
    });

    bot.command("promemoria_cancella", async (ctx) => {
      const arg = (ctx.message?.text || "").split(" ").slice(1)[0];
      const chat_id = ctx.chat?.id;
      const requester_user_id = ctx.from?.id;
      const id = Number(arg);
      if (!Number.isInteger(id))
        return ctx.reply("Uso: /promemoria_cancella <id>");
      // Admin check: in webhook we cannot easily call getChatMember without a Telegram call; rely on author-only delete for simplicity
      const { data, error } = await supabase
        .from("reminders")
        .delete()
        .eq("id", id)
        .eq("chat_id", chat_id)
        .eq("user_id", requester_user_id)
        .select("id");
      if (error) return ctx.reply("❌ Errore nella cancellazione.");
      if (!data?.length)
        return ctx.reply(
          "❌ Promemoria non trovato o non autorizzato a cancellarlo."
        );
      return ctx.reply("✅ Promemoria cancellato.");
    });

    // Poll created (message with poll) - RIMOSSO: duplicato con bot.on('message')

    // Poll updates (vote changes/closed)
    bot.on("poll", async (ctx) => {
      try {
        console.log("Poll update received:", JSON.stringify(ctx.update));
        const poll = ctx.update?.poll;
        if (!poll) return;

        // Aggiorna risultati esistenti
        const results = Object.fromEntries(
          (poll.options || []).map((o) => [o.text, o.voter_count])
        );
        await updatePollResults({
          poll_id: poll.id,
          is_closed: !!poll.is_closed,
          results,
        });
      } catch (e) {
        console.error("Poll update error", e);
      }
    });

    // Catch-all for any message type (including polls)
    bot.on("message", async (ctx) => {
      try {
        const message = ctx.message;
        if (message?.poll) {
          console.log("Poll message detected:", JSON.stringify(message.poll));
          const poll = message.poll;
          const poll_id = poll.id;
          const chat_id = ctx.chat?.id;
          const message_id = ctx.message?.message_id;
          const creator_user_id = ctx.from?.id;
          const question = poll.question || "";
          const options = (poll.options || []).map((o) => o.text);

          console.log("Saving poll to database:", {
            poll_id,
            chat_id,
            question,
          });
          await savePoll({
            poll_id,
            chat_id,
            message_id,
            creator_user_id,
            question,
            options,
          });

          const cmd = `/applica_sondaggio ${poll_id}`;
          const text = `🗳️ Sondaggio registrato.\nID: \`${poll_id}\`\nPer applicare i risultati: ${cmd} (solo admin)`;
          console.log("Sending poll response:", text);

          await ctx.reply(text, {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "Applica sondaggio",
                    callback_data: `apply:${poll_id}`,
                  },
                ],
              ],
            },
          });

          console.log("Poll response sent successfully");
        }
      } catch (e) {
        console.error("Message handler error:", e);
      }
    });

    bot.action(/apply:.+/, async (ctx) => {
      try {
        const data = ctx.match?.input || "";
        const poll_id = String(data.split(":")[1] || "").trim();
        if (!poll_id) return ctx.answerCbQuery("ID sondaggio mancante");
        // Admin check
        const chat_id = ctx.chat?.id;
        const user_id = ctx.from?.id;
        const isAdmin = await isUserAdmin(chat_id, user_id);
        if (!isAdmin)
          return ctx.answerCbQuery("Solo gli admin possono applicare.");
        await handleApplyPoll(ctx, poll_id);
        await ctx.answerCbQuery();
      } catch (e) {
        console.error(e);
        try {
          await ctx.answerCbQuery("Errore");
        } catch {}
      }
    });

    bot.command("applica_sondaggio", async (ctx) => {
      console.log("Applica sondaggio command received:", ctx.message?.text);
      const poll_id = (ctx.message?.text || "").split(" ").slice(1)[0];
      console.log("Extracted poll_id:", poll_id);
      if (!poll_id) return ctx.reply("Uso: /applica_sondaggio <poll_id>");
      const chat_id = ctx.chat?.id;
      const user_id = ctx.from?.id;
      console.log("Checking admin status for:", { chat_id, user_id });
      const isAdmin = await isUserAdmin(chat_id, user_id);
      console.log("Is admin:", isAdmin);
      if (!isAdmin)
        return ctx.reply(
          "❌ Solo gli amministratori possono applicare un sondaggio."
        );
      console.log("Proceeding with poll application for:", poll_id);
      await handleApplyPoll(ctx, poll_id);
    });

    // Gestisce anche /applica_sondaggio@botname
    bot.hears(/\/applica_sondaggio(@\w+)?\s+(.+)/, async (ctx) => {
      console.log(
        "Applica sondaggio heard command received:",
        ctx.message?.text
      );
      const match = ctx.message?.text?.match(
        /\/applica_sondaggio(@\w+)?\s+(.+)/
      );
      if (!match) return;
      const poll_id = match[2].trim();
      console.log("Extracted poll_id from heard:", poll_id);
      const chat_id = ctx.chat?.id;
      const user_id = ctx.from?.id;
      console.log("Checking admin status for heard:", { chat_id, user_id });
      const isAdmin = await isUserAdmin(chat_id, user_id);
      console.log("Is admin for heard:", isAdmin);
      if (!isAdmin)
        return ctx.reply(
          "❌ Solo gli amministratori possono applicare un sondaggio."
        );
      console.log("Proceeding with poll application for heard:", poll_id);
      await handleApplyPoll(ctx, poll_id);
    });

    bot.command("sondaggio_manuale", async (ctx) => {
      // /sondaggio_manuale "Domanda" "Opzione vincente" ["Opz1|Opz2|..."]
      const txt = ctx.message?.text || "";
      const parts = parseQuotedArgs(txt);
      if (parts.length < 2)
        return ctx.reply(
          'Uso: /sondaggio_manuale "Domanda" "Opzione vincente" ["Opz1|Opz2|..."]'
        );
      const chat_id = ctx.chat?.id;
      const user_id = ctx.from?.id;
      const isAdmin = await isUserAdmin(chat_id, user_id);
      if (!isAdmin)
        return ctx.reply(
          "❌ Solo gli amministratori possono applicare un sondaggio manuale."
        );
      const question = parts[0];
      const winning = parts[1];
      const options = parts[2]
        ? parts[2]
            .split("|")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
      await applyDecisionFromAI(ctx, {
        question,
        options,
        winning,
        resultsSummary: null,
      });
    });
  }

  // Initialize OpenAI client
  if (!openai) {
    if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
    console.log("Creating OpenAI client...");
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log("OpenAI client created successfully");
  } else {
    console.log("OpenAI client already exists");
  }

  // Initialize Supabase client
  if (!supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    console.log("Creating Supabase client...");
    supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("Supabase client created successfully");
  } else if (supabase) {
    console.log("Supabase client already exists");
  } else {
    console.log("Supabase client not configured - skipping");
  }

  console.log("ensureClients completed");
}

function formatRule(content) {
  return content
    .replaceAll("○", "•")
    .replaceAll("●", "•")
    .replaceAll(" •", "\n•")
    .replaceAll("•", "• ")
    .replaceAll("  ", " ");
}

async function askAboutRules(question, rulesText) {
  try {
    console.log("askAboutRules called with question:", question);
    console.log("Rules text length:", rulesText.length);

    if (!openai) {
      throw new Error("OpenAI client not initialized");
    }

    const prompt = `Sei un assistente esperto di fantacalcio. Rispondi alla seguente domanda basandoti SOLO sul regolamento fornito.\n\nRegolamento:\n${rulesText}\n\nDomanda: ${question}\n\nRispondi in italiano in modo chiaro e conciso, citando le regole specifiche quando possibile. Se la domanda non riguarda il regolamento, rispondi semplicemente "Non nel regolamento".`;

    console.log("Sending request to OpenAI...");
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Sei un assistente esperto di fantacalcio che risponde solo in base al regolamento fornito.",
        },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 500,
    });

    console.log("OpenAI response received");
    const content = resp.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    return content;
  } catch (error) {
    console.error("Error in askAboutRules:", error);
    throw error;
  }
}

async function getAllRules() {
  try {
    console.log("getAllRules called");

    if (!supabase) {
      console.log("Supabase client not configured, returning empty rules");
      return [];
    }

    console.log("Querying Supabase for rules...");
    const { data, error } = await supabase
      .from("rules")
      .select("rule_number, content")
      .order("rule_number", { ascending: true });

    if (error) {
      console.error("Supabase error:", error);
      throw error;
    }

    console.log(`Retrieved ${data?.length || 0} rules from database`);
    return data || [];
  } catch (error) {
    console.error("Error in getAllRules:", error);
    throw error;
  }
}

async function isUserAdmin(chat_id, user_id) {
  try {
    if (!chat_id || !user_id) return false;
    const member = await bot.telegram.getChatMember(chat_id, user_id);
    const status = member?.status || "";
    return ["administrator", "creator", "owner"].includes(status);
  } catch {
    return false;
  }
}

async function savePoll({
  poll_id,
  chat_id,
  message_id,
  creator_user_id,
  question,
  options,
}) {
  if (!supabase) return;
  const options_json = JSON.stringify(options || []);

  // Se mancano chat_id o message_id, non possiamo salvare completamente
  if (!chat_id || !message_id) {
    console.log("Cannot save poll without chat_id or message_id:", {
      poll_id,
      chat_id,
      message_id,
    });
    return;
  }

  await supabase.from("polls").upsert({
    poll_id,
    chat_id,
    message_id,
    creator_user_id,
    question,
    options_json,
  });
  console.log("Poll saved successfully:", poll_id);
}

async function updatePollResults({ poll_id, is_closed, results }) {
  if (!supabase) return;
  await supabase
    .from("polls")
    .update({
      is_closed: is_closed ? 1 : 0,
      results_json: JSON.stringify(results || {}),
    })
    .eq("poll_id", poll_id);
}

async function getPoll(poll_id) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("polls")
    .select("*")
    .eq("poll_id", poll_id)
    .single();
  if (error) return null;
  return data;
}

function parseQuotedArgs(text) {
  const re = /\"([^\"]*)\"|([^\s]+)/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1] !== undefined) out.push(m[1]);
    else if (m[2] !== undefined) out.push(m[2]);
  }
  return out.filter((s) => !s.startsWith("/sondaggio_manuale"));
}

async function handleApplyPoll(ctx, poll_id) {
  console.log("handleApplyPoll called with poll_id:", poll_id);
  const pollRow = await getPoll(poll_id);
  console.log("Poll row from database:", pollRow);
  if (!pollRow)
    return ctx.reply(
      "❌ Sondaggio non trovato nel database. Rispondi al messaggio con /applica_sondaggio oppure riprova più tardi."
    );
  const rules = await getAllRules();
  console.log("Rules loaded:", rules.length);
  const rulesText = rules
    .map((r) => `${r.rule_number}. ${r.content}`)
    .join("\n\n");
  const question = pollRow.question || "";
  let options = [];
  try {
    options = JSON.parse(pollRow.options_json || "[]");
  } catch {}
  let results = {};
  try {
    results = JSON.parse(pollRow.results_json || "{}");
  } catch {}
  console.log("Parsed poll data:", { question, options, results });
  const sorted = Object.entries(results).sort((a, b) => b[1] - a[1]);
  const winning = sorted.length ? sorted[0][0] : null;
  const summary = sorted.length
    ? sorted.map(([o, c]) => `${o}: ${c}`).join(", ")
    : null;
  console.log("Poll analysis:", { winning, summary });
  await applyDecisionFromAI(ctx, {
    question,
    options,
    winning,
    resultsSummary: summary,
    rulesText,
  });
}

async function applyDecisionFromAI(
  ctx,
  { question, options, winning, resultsSummary, rulesText }
) {
  const rules =
    rulesText ||
    (await getAllRules())
      .map((r) => `${r.rule_number}. ${r.content}`)
      .join("\n\n");
  const toolCalls = await decideRuleActionWithTools({
    poll_question: question,
    poll_options: options,
    winning_option: winning,
    poll_result_summary: resultsSummary,
    rules_text: rules,
  });
  let action = null;
  let rule_number = null;
  let proposed_content = null;
  for (const call of toolCalls) {
    const name = call.name;
    const args = call.arguments || {};
    if (name === "remove_rule") {
      action = "remove";
      rule_number = args.rule_number;
      break;
    }
    if (name === "update_rule") {
      action = "update";
      rule_number = args.rule_number;
      proposed_content = args.content;
      break;
    }
    if (name === "add_rule") {
      action = "add";
      rule_number = args.rule_number;
      proposed_content = args.content;
      break;
    }
  }
  if (!action)
    return ctx.reply(
      "❌ Non sono riuscito a capire l'azione dal sondaggio. Riformula la domanda o rendi più chiare le opzioni (es. sì/no)."
    );

  if (action === "remove") {
    if (rule_number == null)
      return ctx.reply("❌ Sondaggio di rimozione senza numero di regola.");
    const existed = await ruleExists(rule_number);
    if (!existed)
      return ctx.reply(
        `ℹ️ La regola ${rule_number} non esiste già. Nessuna rimozione effettuata.`
      );
    await deleteRule(rule_number);
    return ctx.reply(`✅ Regola ${rule_number} rimossa con successo.`);
  }

  if (rule_number == null && action === "add") {
    rule_number = await getNextRuleNumber();
  }
  if (!proposed_content)
    return ctx.reply(
      "❌ Nessun contenuto proposto trovato. Rendi più chiara la domanda/risposta."
    );
  const ok = await addOrUpdateRule(rule_number, proposed_content);
  if (!ok) return ctx.reply("❌ Errore durante il salvataggio della regola.");
  const existed = await ruleExists(rule_number);
  const verb = existed ? "aggiornata" : "aggiunta";
  await ctx.reply(`✅ Regola ${rule_number} ${verb} con successo.`);
  // Per preferenza utente, includi la nuova regola nel messaggio
  if (existed) {
    await ctx.reply(
      `📋 Regola ${rule_number} aggiornata:\n\n${proposed_content}`,
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.reply(`📋 Nuova regola ${rule_number}:\n\n${proposed_content}`, {
      parse_mode: "Markdown",
    });
  }
}

async function decideRuleActionWithTools({
  poll_question,
  poll_options,
  rules_text,
  winning_option,
  poll_result_summary,
}) {
  const tools = [
    {
      type: "function",
      function: {
        name: "add_rule",
        description:
          "Aggiungi una nuova regola (se non esiste già una regola sullo stesso tema).",
        parameters: {
          type: "object",
          properties: {
            rule_number: { type: ["integer", "null"] },
            content: { type: "string" },
          },
          required: ["content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_rule",
        description:
          "Aggiorna una regola esistente con un nuovo testo completo (sostitutivo).",
        parameters: {
          type: "object",
          properties: {
            rule_number: { type: "integer" },
            content: { type: "string" },
          },
          required: ["rule_number", "content"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "remove_rule",
        description: "Rimuovi una regola esistente.",
        parameters: {
          type: "object",
          properties: {
            rule_number: { type: "integer" },
          },
          required: ["rule_number"],
        },
      },
    },
  ];
  const system_msg = `Sei un assistente per la gestione di un regolamento del fantacalcio. Devi scegliere UNA e una sola tra le funzioni add_rule, update_rule, remove_rule.\n\nOBIETTIVO\n- Applica in modo fedele l'esito del sondaggio al regolamento.\n- Non inventare mai informazioni non presenti.\n\nSCELTA DELL'AZIONE\n- update_rule: se esiste già una regola sullo stesso tema.\n- remove_rule: se la domanda è del tipo ‘teniamo/aboliamo X?’ e prevale ‘No’.\n- add_rule: solo se introduce un elemento nuovo.\n\nSTILE\n- Italiano formale, testo pronto per regolamento.`;
  const user_msg = `Domanda sondaggio: ${poll_question}\nOpzioni: ${(
    poll_options || []
  ).join(", ")}\nVincitore: ${winning_option || "sconosciuto"}\nRisultati: ${
    poll_result_summary || "n.d."
  }\n\nRegolamento:\n${rules_text}`;
  try {
    const resp = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: system_msg },
        { role: "user", content: user_msg },
      ],
      tools,
      tool_choice: "auto",
      max_completion_tokens: 500,
    });
    const tcalls = resp.choices?.[0]?.message?.tool_calls || [];
    const calls = [];
    for (const t of tcalls) {
      let args;
      try {
        args = JSON.parse(t.function?.arguments || "{}");
      } catch {
        args = {};
      }
      calls.push({ name: t.function?.name, arguments: args });
    }
    return calls;
  } catch (e) {
    console.error("Tool-calling error", e);
    return [];
  }
}

async function ruleExists(rule_number) {
  const { data, error } = await supabase
    .from("rules")
    .select("rule_number")
    .eq("rule_number", rule_number)
    .limit(1);
  if (error) return false;
  return (data || []).length > 0;
}

async function getNextRuleNumber() {
  const { data, error } = await supabase
    .from("rules")
    .select("rule_number")
    .order("rule_number", { ascending: false })
    .limit(1);
  if (error) return 1;
  const max = (data && data[0]?.rule_number) || 0;
  return Number(max) + 1;
}

async function addOrUpdateRule(rule_number, content) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("rules")
    .upsert(
      { rule_number, content, updated_at: now },
      { onConflict: "rule_number" }
    );
  return !error;
}

async function deleteRule(rule_number) {
  const { error } = await supabase
    .from("rules")
    .delete()
    .eq("rule_number", rule_number);
  return !error;
}

export async function handler(event) {
  try {
    console.log("=== Webhook handler started ===");
    console.log("Event body type:", typeof event.body);
    console.log("Event body length:", event.body ? event.body.length : 0);

    // Validate environment variables
    if (!process.env.BOT_TOKEN) {
      throw new Error("Missing BOT_TOKEN environment variable");
    }
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY environment variable");
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.warn(
        "Supabase environment variables not configured - some features may not work"
      );
    }

    console.log("Environment variables validated");

    // Initialize clients
    ensureClients();
    console.log("Clients initialized successfully");

    // Parse and validate Telegram update
    if (!event.body) {
      throw new Error("No body in event");
    }

    let update;
    try {
      update = JSON.parse(event.body);
    } catch (parseError) {
      throw new Error(
        `Failed to parse event body as JSON: ${parseError.message}`
      );
    }

    console.log("Telegram update parsed successfully");
    console.log(
      "Update type:",
      update.message?.text ? "text message" : "other"
    );

    // Handle the update
    await bot.handleUpdate(update);
    console.log("Update handled successfully");

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, timestamp: new Date().toISOString() }),
    };
  } catch (e) {
    console.error("=== Webhook handler error ===");
    console.error("Error details:", e);
    console.error("Error stack:", e.stack);

    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: String(e),
        timestamp: new Date().toISOString(),
      }),
    };
  }
}
