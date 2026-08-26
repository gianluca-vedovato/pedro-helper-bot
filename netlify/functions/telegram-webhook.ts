import { Telegraf } from "telegraf";
import type { Context } from "telegraf";
import { connectLambda } from "@netlify/blobs";
import { askAboutRules, generateRuleContent } from "./services/ai";
import {
  rulesGetAll,
  rulesUpsert,
  rulesDelete,
  rulesNextNumber,
} from "./services/rules";

const BOT_TOKEN = process.env.BOT_TOKEN;
const ASKPEDRO_PROMPT_PREFIX =
  "✍️ Scrivi la tua domanda sul regolamento rispondendo a questo messaggio.";

let bot: Telegraf<Context> | null = null;

function ensureBot() {
  if (!bot) {
    console.log("🤖 Inizializzazione bot...");
    if (!BOT_TOKEN) {
      console.error("❌ BOT_TOKEN mancante");
      throw new Error("Missing BOT_TOKEN");
    }
    console.log("✅ BOT_TOKEN trovato, creo istanza Telegraf");
    bot = new Telegraf(BOT_TOKEN);
    console.log("✅ Istanza Telegraf creata, configuro comandi...");

    bot.start(async (ctx) => {
      console.log("🚀 Comando /start ricevuto");
      await ctx.reply(
        "Ciao! Sono Pedro (Node). Comandi:\n/regolamento [n]\n/askpedro → poi rispondi con la domanda\n/crea_regola [tema], /aggiorna_regola [numero] [tema], /cancella_regola"
      );
    });

    bot.help(async (ctx) => {
      console.log("❓ Comando /help ricevuto");
      await ctx.reply(
        "Comandi:\n/start\n/help\n/regolamento [numero]\n/askpedro → invia il comando e RISPOSTI con la domanda\n/crea_regola <tema>\n/aggiorna_regola <numero> <tema>\n/cancella_regola <numero>"
      );
    });

    bot.command("regolamento", async (ctx) => {
      console.log("📚 Comando /regolamento ricevuto");
      const arg = (ctx.message?.text || "")
        .split(" ")
        .slice(1)
        .join(" ")
        .trim();
      const rules = await rulesGetAll();
      if (!rules.length) return ctx.reply("❌ Nessuna regola caricata.");
      if (arg) {
        const n = Number(arg);
        if (!Number.isInteger(n))
          return ctx.reply("❌ Numero regola non valido.");
        const found = rules.find((r: any) => r.rule_number === n);
        if (!found) return ctx.reply(`❌ Regola ${n} non trovata.`);
        return ctx.reply(`📋 Regola ${n}:\n\n${formatRule(found.content)}`, {
          parse_mode: "Markdown",
        });
      }

      const rulesText = (rules as any[])
        .map((r) => `📋 Regola ${r.rule_number}:\n${formatRule(r.content)}`)
        .join("\n\n");
      for (let i = 0; i < rulesText.length; i += 4096)
        await ctx.reply(rulesText.slice(i, i + 4096), {
          parse_mode: "Markdown",
        });
    });

    bot.command("askpedro", async (ctx) => {
      console.log("🤖 Comando /askpedro ricevuto");
      const q = (ctx.message?.text || "").split(" ").slice(1).join(" ").trim();
      if (!q) {
        await ctx.reply(
          `${ASKPEDRO_PROMPT_PREFIX}\n\nEsempio: "Come funzionano i cambi?"`
        );
        return;
      }
      const rules = await rulesGetAll();
      if (!rules.length) return ctx.reply("❌ Nessuna regola caricata.");
      const rulesText = (rules as any[])
        .map((r) => `${r.rule_number}. ${r.content}`)
        .join("\n\n");
      const answer = await askAboutRules(q, rulesText);
      await ctx.reply(answer, { parse_mode: "Markdown" });
    });

    bot.command("crea_regola", async (ctx) => {
      console.log("📝 Comando /crea_regola ricevuto");
      const args = (ctx.message?.text || "").split(" ").slice(1);
      if (args.length < 1) {
        return ctx.reply(
          '❌ Uso: /crea_regola <tema>\n\nEsempio:\n/crea_regola "formazione squadra"\n\n🤖 L\'AI genererà automaticamente il contenuto e il numero progressivo della regola!'
        );
      }

      const topic = args.join(" ");

      if (topic.length < 3) {
        return ctx.reply(
          "❌ Il tema della regola deve essere di almeno 3 caratteri."
        );
      }

      const chatId = ctx.chat?.id as number;
      const userId = ctx.from?.id as number;
      const isAdmin = await userIsAdmin(ctx, chatId, userId);

      if (!isAdmin) {
        return ctx.reply("❌ Solo gli amministratori possono creare regole.");
      }

      try {
        // Mostra messaggio di "generazione in corso"
        const processingMsg = await ctx.reply(
          "🤖 Sto generando la regola con l'AI..."
        );

        // Ottieni il prossimo numero disponibile per la regola
        const ruleNumber = await rulesNextNumber();

        // Ottieni le regole esistenti per il contesto
        const existingRules = await rulesGetAll();
        const existingRulesText =
          existingRules.length > 0
            ? existingRules
                .map((r: any) => `${r.rule_number}. ${r.content}`)
                .join("\n")
            : "Nessuna regola esistente";

        // Genera il contenuto della regola con l'AI
        const generatedContent = await generateRuleContent(
          ruleNumber,
          topic,
          existingRulesText
        );

        // Salva la regola generata
        const success = await rulesUpsert(ruleNumber, generatedContent);

        if (success) {
          // Elimina il messaggio di "generazione in corso"
          await ctx.telegram.deleteMessage(chatId, processingMsg.message_id);

          return ctx.reply(
            `✅ Regola ${ruleNumber} generata e salvata con successo!\n\n📋 Contenuto generato dall'AI:\n"${generatedContent}"\n\n💡 Tema richiesto: "${topic}"`
          );
        } else {
          // Elimina il messaggio di "generazione in corso"
          await ctx.telegram.deleteMessage(chatId, processingMsg.message_id);
          return ctx.reply(
            "❌ Errore durante il salvataggio della regola generata."
          );
        }
      } catch (error) {
        console.error("Errore creazione regola con AI:", error);
        return ctx.reply(
          `❌ Errore durante la generazione della regola: ${
            error instanceof Error ? error.message : "Errore sconosciuto"
          }`
        );
      }
    });

    bot.command("cancella_regola", async (ctx) => {
      console.log("🗑️ Comando /cancella_regola ricevuto");
      const arg = (ctx.message?.text || "").split(" ").slice(1)[0];

      if (!arg) {
        return ctx.reply(
          "❌ Uso: /cancella_regola <numero>\n\nEsempio:\n/cancella_regola 5"
        );
      }

      const ruleNumber = Number(arg);
      if (!Number.isInteger(ruleNumber) || ruleNumber <= 0) {
        return ctx.reply(
          "❌ Il numero della regola deve essere un numero intero positivo."
        );
      }

      const chatId = ctx.chat?.id as number;
      const userId = ctx.from?.id as number;
      const isAdmin = await userIsAdmin(ctx, chatId, userId);

      if (!isAdmin) {
        return ctx.reply(
          "❌ Solo gli amministratori possono cancellare regole."
        );
      }

      try {
        const success = await rulesDelete(ruleNumber);
        if (success) {
          return ctx.reply(`✅ Regola ${ruleNumber} cancellata con successo!`);
        } else {
          return ctx.reply("❌ Errore durante la cancellazione della regola.");
        }
      } catch (error) {
        console.error("Errore cancellazione regola:", error);
        return ctx.reply(
          "❌ Errore interno durante la cancellazione della regola."
        );
      }
    });

    bot.command("aggiorna_regola", async (ctx) => {
      console.log("✏️ Comando /aggiorna_regola ricevuto");
      const args = (ctx.message?.text || "").split(" ").slice(1);
      const ruleNumber = Number(args[0]);

      if (!args[0] || !Number.isInteger(ruleNumber) || ruleNumber <= 0) {
        return ctx.reply(
          '❌ Uso: /aggiorna_regola <numero> <nuovo tema>\n\nEsempio:\n/aggiorna_regola 5 "il budget diventa 600 fantamilioni"'
        );
      }

      const topic = args.slice(1).join(" ").trim();
      if (topic.length < 3) {
        return ctx.reply(
          "❌ Il nuovo tema/testo deve essere di almeno 3 caratteri."
        );
      }

      const chatId = ctx.chat?.id as number;
      const userId = ctx.from?.id as number;
      const isAdmin = await userIsAdmin(ctx, chatId, userId);

      if (!isAdmin) {
        return ctx.reply(
          "❌ Solo gli amministratori possono aggiornare regole."
        );
      }

      try {
        const existingRules = await rulesGetAll();
        const existing = (existingRules as any[]).find(
          (r) => r.rule_number === ruleNumber
        );
        if (!existing) {
          return ctx.reply(
            `❌ Regola ${ruleNumber} non trovata. Usa /crea_regola per crearne una nuova.`
          );
        }

        const processingMsg = await ctx.reply(
          "🤖 Sto aggiornando la regola con l'AI..."
        );

        const existingRulesText = (existingRules as any[])
          .map((r) => `${r.rule_number}. ${r.content}`)
          .join("\n");

        const updatedContent = await generateRuleContent(
          ruleNumber,
          `Aggiorna la regola ${ruleNumber} (testo attuale: "${existing.content}") in base a questa richiesta: ${topic}`,
          existingRulesText
        );

        const success = await rulesUpsert(ruleNumber, updatedContent);

        if (success) {
          await ctx.telegram.deleteMessage(chatId, processingMsg.message_id);
          return ctx.reply(
            `✅ Regola ${ruleNumber} aggiornata con successo!\n\n📋 Nuovo contenuto:\n"${updatedContent}"`
          );
        } else {
          await ctx.telegram.deleteMessage(chatId, processingMsg.message_id);
          return ctx.reply(
            "❌ Errore durante il salvataggio della regola aggiornata."
          );
        }
      } catch (error) {
        console.error("Errore aggiornamento regola con AI:", error);
        return ctx.reply(
          `❌ Errore durante l'aggiornamento della regola: ${
            error instanceof Error ? error.message : "Errore sconosciuto"
          }`
        );
      }
    });

    // ======== MODALITÀ INLINE (@bot askpedro) ========
    bot.on("inline_query", async (ctx) => {
      const query = (ctx.inlineQuery?.query || "").trim();
      if (!query) {
        await ctx.answerInlineQuery([], {
          cache_time: 0,
          switch_pm_text: "Scrivi una domanda per chiedere a Pedro",
          switch_pm_parameter: "askpedro",
        });
        return;
      }
      try {
        const rules = await rulesGetAll();
        if (!rules.length) {
          await ctx.answerInlineQuery(
            [
              {
                type: "article",
                id: "no-rules",
                title: "Nessuna regola caricata",
                description: "Il regolamento non è ancora disponibile",
                input_message_content: {
                  message_text: "❌ Nessuna regola caricata nel bot.",
                },
              },
            ],
            { cache_time: 0 }
          );
          return;
        }
        const rulesText = (rules as any[])
          .map((r) => `${r.rule_number}. ${r.content}`)
          .join("\n\n");
        const answer = await askAboutRules(query, rulesText);
        const preview =
          answer.length > 100 ? answer.slice(0, 97) + "…" : answer;
        await ctx.answerInlineQuery(
          [
            {
              type: "article",
              id: `ask-${Date.now()}`,
              title: `Pedro: ${query.slice(0, 50)}${query.length > 50 ? "…" : ""}`,
              description: preview,
              input_message_content: {
                message_text: `❓ *${query}*\n\n${answer}`,
                parse_mode: "Markdown",
              },
            },
          ],
          { cache_time: 60 }
        );
      } catch (e) {
        console.error("Errore inline_query:", e);
        await ctx.answerInlineQuery(
          [
            {
              type: "article",
              id: "error",
              title: "Errore",
              description: "Riprova tra poco",
              input_message_content: {
                message_text: "❌ Errore nel recuperare la risposta. Riprova.",
              },
            },
          ],
          { cache_time: 0 }
        );
      }
    });

    // ======== RISPOSTA ALLA PROMPT /ASKPEDRO ========
    bot.on("text", async (ctx) => {
      try {
        const msg: any = ctx.message;
        if (!msg || !msg.text) return;
        const replied: any = msg.reply_to_message;
        const repliedText = String(replied?.text || "");
        const repliedFromIsBot = Boolean(replied?.from?.is_bot);
        if (!replied || !repliedFromIsBot) return;
        if (!repliedText.startsWith(ASKPEDRO_PROMPT_PREFIX)) return;

        const q = String(msg.text || "").trim();
        if (!q) return;
        const rules = await rulesGetAll();
        if (!rules.length) return ctx.reply("❌ Nessuna regola caricata.");
        const rulesText = (rules as any[])
          .map((r) => `${r.rule_number}. ${r.content}`)
          .join("\n\n");
        const answer = await askAboutRules(q, rulesText);
        await ctx.reply(answer, { parse_mode: "Markdown" });
      } catch (e) {
        console.error("Errore gestione risposta askpedro:", e);
      }
    });

    console.log("✅ Tutti i comandi configurati");
  } else {
    console.log("🤖 Bot già inizializzato");
  }
  return bot;
}

function formatRule(content: string): string {
  return content.replace(/\*\*/g, "**").replace(/\n/g, "\n");
}

async function userIsAdmin(
  ctx: Context,
  chatId: number,
  userId: number
): Promise<boolean> {
  try {
    if (!chatId || !userId) return false;
    const admins = await ctx.telegram.getChatAdministrators(chatId);
    return admins.some((a) => a.user.id === userId);
  } catch (e) {
    console.error("Errore verifica admin:", e);
    return false;
  }
}

export async function handler(event: any) {
  try {
    if (event?.blobs) connectLambda(event);
    const method =
      event?.httpMethod || event?.method || (event?.body ? "POST" : "GET");
    const url = event?.rawUrl || event?.path || "";
    console.log("🚀 Webhook ricevuto:", method, url);

    if (method === "POST") {
      const bot = ensureBot();
      if (!bot) {
        console.error("❌ Bot non inizializzato");
        return {
          statusCode: 500,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "Bot non inizializzato" }),
        };
      }

      const rawBody = event?.body;
      const update =
        typeof rawBody === "string" ? safeJsonParse(rawBody) : rawBody;
      console.log(
        "📨 Update ricevuto:",
        update?.update_id ? `ID: ${update.update_id}` : "No ID"
      );

      await bot.handleUpdate(update);
      console.log("✅ Update gestito con successo");

      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: true }),
      };
    } else {
      console.log("ℹ️ Richiesta GET ricevuta");
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "Bot attivo",
          timestamp: new Date().toISOString(),
          commands: [
            "/start",
            "/help",
            "/regolamento",
            "/askpedro",
            "/crea_regola",
            "/aggiorna_regola",
            "/cancella_regola",
          ],
        }),
      };
    }
  } catch (error) {
    console.error("❌ Errore nel webhook:", error);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Errore interno del server" }),
    };
  }
}

function safeJsonParse(body: string): any {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
