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
  if (!bot) {
    if (!BOT_TOKEN) throw new Error("Missing BOT_TOKEN");
    bot = new Telegraf(BOT_TOKEN);

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
      const q = (ctx.message?.text || "").split(" ").slice(1).join(" ").trim();
      if (!q) return ctx.reply("❌ Uso: /askpedro [domanda]");
      const rules = await getAllRules();
      if (!rules.length) return ctx.reply("❌ Nessuna regola caricata.");
      const rulesText = rules
        .map((r) => `${r.rule_number}. ${r.content}`)
        .join("\n\n");
      try {
        const answer = await askAboutRules(q, rulesText);
        await ctx.reply(`🤖 Pedro dice:\n\n${answer}`, {
          parse_mode: "Markdown",
        });
      } catch (e) {
        console.error(e);
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

        // Se è un nuovo sondaggio (non ha voter_count > 0), salvalo
        if (poll.total_voter_count === 0 && !poll.is_closed) {
          console.log("New poll detected, saving to database");
          const poll_id = poll.id;
          const question = poll.question || "";
          const options = (poll.options || []).map((o) => o.text);

          // Salva il sondaggio (chat_id e message_id non disponibili in poll update)
          await savePoll({
            poll_id,
            chat_id: null, // Non disponibile in poll update
            message_id: null,
            creator_user_id: null,
            question,
            options,
          });

          // Non possiamo rispondere qui perché non abbiamo il chat_id
          console.log("Poll saved but cannot reply without chat context");
        } else {
          // Aggiorna risultati esistenti
          const results = Object.fromEntries(
            (poll.options || []).map((o) => [o.text, o.voter_count])
          );
          await updatePollResults({
            poll_id: poll.id,
            is_closed: !!poll.is_closed,
            results,
          });
        }
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
      const poll_id = (ctx.message?.text || "").split(" ").slice(1)[0];
      if (!poll_id) return ctx.reply("Uso: /applica_sondaggio <poll_id>");
      const chat_id = ctx.chat?.id;
      const user_id = ctx.from?.id;
      const isAdmin = await isUserAdmin(chat_id, user_id);
      if (!isAdmin)
        return ctx.reply(
          "❌ Solo gli amministratori possono applicare un sondaggio."
        );
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
  if (!openai) {
    if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  if (!supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
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
  const prompt = `Sei un assistente esperto di fantacalcio. Rispondi alla seguente domanda basandoti SOLO sul regolamento fornito.\n\nRegolamento:\n${rulesText}\n\nDomanda: ${question}\n\nRispondi in italiano in modo chiaro e conciso, citando le regole specifiche quando possibile. Se la domanda non riguarda il regolamento, rispondi semplicemente "Non nel regolamento".`;
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
    temperature: 0.7,
    max_tokens: 500,
  });
  return (
    resp.choices?.[0]?.message?.content?.trim() || "Errore nella risposta."
  );
}

async function getAllRules() {
  if (supabase) {
    const { data, error } = await supabase
      .from("rules")
      .select("rule_number, content")
      .order("rule_number", { ascending: true });
    if (error) throw error;
    return data || [];
  }
  // If no Supabase configured, return empty (or switch to D1/SQLite on other hosts)
  return [];
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
  const pollRow = await getPoll(poll_id);
  if (!pollRow)
    return ctx.reply(
      "❌ Sondaggio non trovato nel database. Rispondi al messaggio del sondaggio con /applica_sondaggio oppure riprova più tardi."
    );
  const rules = await getAllRules();
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
  const sorted = Object.entries(results).sort((a, b) => b[1] - a[1]);
  const winning = sorted.length ? sorted[0][0] : null;
  const summary = sorted.length
    ? sorted.map(([o, c]) => `${o}: ${c}`).join(", ")
    : null;
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
      temperature: 0,
      max_tokens: 500,
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
    ensureClients();
    console.log("Webhook received:", JSON.stringify(event.body || {}));
    // Telegram sends JSON updates to webhook
    const update = event.body ? JSON.parse(event.body) : {};
    console.log("Parsed update:", JSON.stringify(update));
    await bot.handleUpdate(update);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: String(e) }),
    };
  }
}
