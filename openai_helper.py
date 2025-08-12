from openai import OpenAI
import math
import json
from config import OPENAI_API_KEY, OPENAI_MODEL, MAX_TOKENS

class OpenAIHelper:
    def __init__(self):
        self.client = OpenAI(api_key=OPENAI_API_KEY)
    
    def ask_about_rules(self, question, rules_text):
        """Ask OpenAI about the rules and get an answer"""
        try:
            prompt = f"""Sei un assistente esperto di fantacalcio. Rispondi alla seguente domanda basandoti SOLO sul regolamento fornito.

Regolamento:
{rules_text}

Domanda: {question}

Rispondi in italiano in modo chiaro e conciso, citando le regole specifiche quando possibile. Se la domanda non riguarda il regolamento, rispondi semplicemente "Non nel regolamento"."""

            response = self.client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "Sei un assistente esperto di fantacalcio che risponde solo in base al regolamento fornito."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=MAX_TOKENS,
                temperature=0.7
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            print(f"Error calling OpenAI API: {e}")
            return "Errore nella chiamata all'API. Riprova più tardi."
    
    def is_rulebook_question(self, question, rules_text):
        """Check if a question is related to the rulebook"""
        try:
            prompt = f"""Determina se la seguente domanda riguarda il regolamento del fantacalcio.

Regolamento:
{rules_text}

Domanda: {question}

Rispondi solo con "SI" se la domanda riguarda il regolamento, o "NO" se non riguarda il regolamento."""

            response = self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[
                    {"role": "system", "content": "Rispondi solo con SI o NO."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=10,
                temperature=0.1
            )
            
            answer = response.choices[0].message.content.strip().upper()
            return answer == "SI"
            
        except Exception as e:
            print(f"Error checking if question is rulebook-related: {e}")
            # Default to True to be safe
            return True 

    def parse_poll_intent(self, poll_question: str, poll_options: list[str] | None, rules_text: str, winning_option: str | None = None, poll_result_summary: str | None = None, candidate_rules_text: str | None = None):
        """Use OpenAI to parse a free-form poll into a structured intent.

        Returns a dict like:
        {
          "approved": true/false/None,
          "action": "add"|"update"|"remove"|None,
          "rule_number": int|None,
          "content": str|None,
          "reason": str
        }
        """
        try:
            options_text = "\n".join([f"- {opt}" for opt in (poll_options or [])])
            prompt = (
                "Sei un assistente di automazione. Ti fornisco:\n"
                "- Domanda del sondaggio (libera)\n"
                "- Opzioni del sondaggio\n"
                "- Regolamento attuale (per capire se una regola esiste già e con che numero)\n\n"
                "Obiettivo (seguire SCRUPOLOSAMENTE):\n"
                "1) Se esiste già una regola sullo stesso tema, scegli 'update' e indica il numero della regola esistente; NON creare duplicati.\n"
                "2) Se la domanda è del tipo 'teniamo X?' e prevale 'No' (o sinonimi), l'azione è 'remove' della regola X, se esiste.\n"
                "3) Per 'update', restituisci un testo COMPLETO per sostituire integralmente la regola: modifica il minimo necessario e NON introdurre elementi/criteri non presenti nel sondaggio o nella regola esistente.\n"
                "4) Per regole elenco (es. criteri classifica), limita i punti ai soli elementi già presenti nella regola o esplicitamente citati nel sondaggio; puoi solo ri-ordinare o riformulare senza aggiungere nuovi criteri.\n"
                "5) Usa 'remove' solo per cancellare una regola esistente; 'add' crea nuove regole solo se non esiste nulla di simile.\n"
                "6) Determina l'approvazione (approved) in base al risultato del sondaggio (uso di sinonimi ammesso: sì/si/yes/ok ↔ approvazione; no/not/abolire ↔ non approvazione).\n\n"
                f"Domanda del sondaggio:\n{poll_question}\n\n"
                f"Opzioni:\n{options_text}\n\n"
                f"Risultato prevalente (se noto): {winning_option or 'sconosciuto'}\n"
                f"Riepilogo risultati: {poll_result_summary or 'n.d.'}\n\n"
                f"Regolamento attuale:\n{rules_text}\n\n"
                f"Regole potenzialmente rilevanti:\n{candidate_rules_text or 'n.d.'}\n\n"
                "Fornisci risposta in JSON valido con chiavi: approved (true/false/null), action (\"add\"|\"update\"|\"remove\"|null), rule_number (numero o null), content (stringa o null), reason (stringa breve)."
            )
            
            # Log minimal prompt header
            print("[AI] Prompt inviato (header): Domanda/Opzioni/Risultato/Regole candidate inclusi")

            response = self.client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "Sei un assistente che restituisce SOLO JSON valido, senza testo extra."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=MAX_TOKENS,
                temperature=0.1
            )

            raw = response.choices[0].message.content.strip()
            print("[AI] Risposta ricevuta da OpenAI")
            
            # Strip code fences if present
            if raw.startswith("```"):
                # remove leading ```
                raw = raw[3:]
                # drop optional language label like 'json'
                tmp = raw.lstrip()
                if tmp.lower().startswith("json"):
                    raw = tmp[4:]
                # remove trailing ``` if present
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()
                # Minimal log
                pass
            
            import json as _json
            data = _json.loads(raw)
            print(f"[AI] Intent parsed: {data}")
            return data
        except Exception as e:
            print(f"Error parsing poll intent: {e}")
            return {"approved": None, "action": None, "rule_number": None, "content": None, "reason": "parse_error"}

    def identify_target_rule(self, proposed_content: str, rules_text: str):
        """Given proposed content, try to identify which existing rule number should be updated.
        Returns dict: {"rule_number": int|None, "confidence": float|None, "reason": str}
        """
        try:
            prompt = (
                "Devi trovare quale regola esistente corrisponde meglio al seguente contenuto proposto,"
                " in modo da aggiornare quella regola invece di crearne una nuova.\n\n"
                f"Contenuto proposto:\n{proposed_content}\n\n"
                f"Regolamento attuale (formato 'numero. testo'):\n{rules_text}\n\n"
                "Rispondi SOLO in JSON con chiavi: rule_number (numero o null), confidence (0-1), reason (stringa breve)."
            )
            response = self.client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": "Sei un assistente che restituisce SOLO JSON valido, senza testo extra."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=MAX_TOKENS,
                temperature=0.2
            )
            raw = response.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw[3:]
                tmp = raw.lstrip()
                if tmp.lower().startswith("json"):
                    raw = tmp[4:]
                if raw.endswith("```"):
                    raw = raw[:-3]
                raw = raw.strip()
            import json as _json
            data = _json.loads(raw)
            return data
        except Exception as e:
            print(f"Error identifying target rule: {e}")
            return {"rule_number": None, "confidence": None, "reason": "identify_error"}

    def _normalize(self, v):
        norm = math.sqrt(sum((x * x) for x in v)) or 1.0
        return [x / norm for x in v]

    def find_candidate_rules_by_embedding(self, query: str, rules: list[tuple[int, str]], top_k: int = 3):
        """Return top_k candidate rules by semantic similarity to query using embeddings."""
        try:
            inputs = [query] + [content for _, content in rules]
            emb = self.client.embeddings.create(model="text-embedding-3-small", input=inputs)
            vectors = [self._normalize(d.embedding) for d in emb.data]
            qv = vectors[0]
            rule_vecs = vectors[1:]
            scored = []
            for (num, content), rv in zip(rules, rule_vecs):
                score = sum(a * b for a, b in zip(qv, rv))
                scored.append((score, num, content))
            scored.sort(reverse=True)
            return scored[:top_k]
        except Exception as e:
            print(f"Error in embeddings: {e}")
            return []

    def decide_rule_action_with_tools(
        self,
        poll_question: str,
        poll_options: list[str] | None,
        rules_text: str,
        winning_option: str | None = None,
        poll_result_summary: str | None = None,
        candidate_rules_text: str | None = None,
    ):
        """Use OpenAI function calling to choose one of: add_rule, update_rule, remove_rule.

        Returns a list of tool call dicts like:
        [{"name": "update_rule", "arguments": {"rule_number": 19, "content": "..."}}]
        """
        tools = [
            {
                "type": "function",
                "function": {
                    "name": "add_rule",
                    "description": "Aggiungi una nuova regola (se non esiste già una regola sullo stesso tema).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "rule_number": {"type": ["integer", "null"], "description": "Numero regola da usare; se null verrà assegnato automaticamente."},
                            "content": {"type": "string", "description": "Testo completo della nuova regola."}
                        },
                        "required": ["content"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "update_rule",
                    "description": "Aggiorna una regola esistente con un nuovo testo completo (sostitutivo).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "rule_number": {"type": "integer", "description": "Numero della regola da aggiornare."},
                            "content": {"type": "string", "description": "Nuovo testo completo della regola."}
                        },
                        "required": ["rule_number", "content"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "remove_rule",
                    "description": "Rimuovi una regola esistente.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "rule_number": {"type": "integer", "description": "Numero della regola da rimuovere."}
                        },
                        "required": ["rule_number"]
                    }
                }
            }
        ]

        system_msg = (
            "Sei un assistente per la gestione di un regolamento del fantacalcio. Devi scegliere UNA e una sola tra le funzioni add_rule, update_rule, remove_rule.\n"
            "\n"
            "OBIETTIVO\n"
            "- Applica in modo fedele l'esito del sondaggio al regolamento.\n"
            "- Non inventare mai informazioni, valori, vincoli o criteri non presenti nel sondaggio o nella regola esistente.\n"
            "- Se il sondaggio è ambiguo, interpreta secondo il significato più prudente e letterale.\n"
            "\n"
            "SCELTA DELL'AZIONE\n"
            "- update_rule: se esiste già una regola sullo stesso tema. Aggiorna quella regola, senza creare duplicati.\n"
            "- remove_rule: se la domanda è del tipo ‘teniamo/aboliamo X?’ e prevale ‘No/abolire/non tenere’, rimuovi la regola X (se esiste).\n"
            "- add_rule: solo se non esiste nessuna regola sul tema e il sondaggio introduce un elemento realmente nuovo.\n"
            "\n"
            "SELEZIONE DELLA REGOLA DA MODIFICARE O RIMUOVERE\n"
            "- Identifica il numero della regola usando il testo del regolamento fornito (matching semantico e parole-chiave dalla domanda).\n"
            "- Se più regole sono simili, scegli quella più specifica e pertinente.\n"
            "\n"
            "COSTRUZIONE DEL TESTO (content)\n"
            "- update_rule: restituisci il TESTO COMPLETO della regola sostitutiva, conservando il titolo o l'impostazione originale quando possibile.\n"
            "  Modifica solo quanto richiesto dal sondaggio. Mantieni inequivocabili quantità e unità (‘5 giorni’ resta ‘5 giorni’, non ‘5 minuti’).\n"
            "  Per elenchi (es. criteri di classifica), riordina o limita ai soli punti già presenti o esplicitamente scelti nel sondaggio; non aggiungere nuovi punti.\n"
            "- add_rule: restituisci il testo completo e formale della nuova regola, coerente con lo stile del regolamento.\n"
            "- remove_rule: non fornire content.\n"
            "\n"
            "STILE E QUALITÀ\n"
            "- Italiano formale, tono da regolamento ufficiale. Nessuna emoji, nessun preambolo, nessun commento.\n"
            "- Il testo deve essere pronto per l'inserimento diretto nel regolamento.\n"
            "- Se il sondaggio implica un valore o una scadenza, riportali esattamente come espressi (numero e unità).\n"
            "\n"
            "COERENZA CON L'ESITO\n"
            "- Considera la risposta prevalente (anche con sinonimi: sì/si/yes/ok ↔ approvazione; no/not/abolire ↔ non approvazione).\n"
            "- Il contenuto finale deve essere perfettamente coerente con l'opzione vincente.\n"
        )

        user_msg = (
            f"Domanda sondaggio: {poll_question}\n"
            f"Opzioni: {', '.join(poll_options or [])}\n"
            f"Vincitore: {winning_option or 'sconosciuto'}\n"
            f"Risultati: {poll_result_summary or 'n.d.'}\n\n"
            f"Regolamento (formato 'numero. testo'):\n{rules_text}\n\n"
            f"Regole candidate (se presenti):\n{candidate_rules_text or 'n.d.'}\n"
        )

        try:
            resp = self.client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                tools=tools,
                tool_choice="auto",
                temperature=0.0,
                max_tokens=MAX_TOKENS,
            )
            tcalls = resp.choices[0].message.tool_calls or []
            calls = []
            for t in tcalls:
                try:
                    args = json.loads(t.function.arguments or "{}")
                except Exception:
                    args = {}
                calls.append({"name": t.function.name, "arguments": args})
            print("[AI] Tool calls:", calls)
            return calls
        except Exception as e:
            print(f"Error in tool-calling: {e}")
            return []