import OpenAI from "openai";
let client = null;
function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
    client = new OpenAI({ apiKey });
  }
  return client;
}
export async function askAboutRules(
  question,
  rulesText,
  model = process.env.OPENAI_MODEL || "gpt-4o-mini"
) {
  const prompt = `Sei un assistente esperto di fantacalcio. Rispondi alla seguente domanda basandoti SOLO sul regolamento fornito.\n\nRegolamento:\n${rulesText}\n\nDomanda: ${question}\n\nRispondi in italiano in modo chiaro e conciso, citando le regole specifiche quando possibile. Se la domanda non riguarda il regolamento, rispondi semplicemente "Non nel regolamento".`;
  const openai = getClient();
  const resp = await openai.chat.completions.create({
    model,
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
  return (
    resp.choices?.[0]?.message?.content?.trim() || "Errore nella risposta."
  );
}
export async function decideRuleActionWithTools(args) {
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
  const user_msg = `Domanda sondaggio: ${args.poll_question}\nOpzioni: ${(
    args.poll_options || []
  ).join(", ")}\nVincitore: ${
    args.winning_option || "sconosciuto"
  }\nRisultati: ${args.poll_result_summary || "n.d."}\n\nRegolamento:\n${
    args.rules_text
  }`;
  const openai = getClient();
  const resp = await openai.chat.completions.create({
    model: args.model || process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: system_msg },
      { role: "user", content: user_msg },
    ],
    tools,
    tool_choice: "auto",
    max_completion_tokens: 500,
  });
  const tcalls = resp.choices?.[0]?.message?.tool_calls || [];
  return tcalls.map((t) => {
    let parsed;
    try {
      parsed = JSON.parse(t.function?.arguments || "{}");
    } catch {
      parsed = {};
    }
    return { name: t.function?.name, arguments: parsed };
  });
}
