import openai
import math
import json
from config import OPENAI_API_KEY, OPENAI_MODEL, MAX_TOKENS

class OpenAIHelper:
    def __init__(self):
        openai.api_key = OPENAI_API_KEY
    
    def ask_question(self, question, rules_text):
        """Ask OpenAI about the rules and get an answer"""
        try:
            prompt = f"""Sei un assistente esperto di fantacalcio. Rispondi alla seguente domanda basandoti SOLO sul regolamento fornito.

Regolamento:
{rules_text}

Domanda: {question}

Rispondi in italiano in modo chiaro e conciso, citando le regole specifiche quando possibile. Se la domanda non riguarda il regolamento, rispondi semplicemente "Non nel regolamento"."""

            response = openai.ChatCompletion.create(
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
    
    def ask_about_rules(self, question, rules_text):
        """Ask OpenAI about the rules and get an answer (alias for compatibility)"""
        return self.ask_question(question, rules_text)
    
    def is_rulebook_question(self, question, rules_text):
        """Check if a question is related to the rulebook"""
        try:
            prompt = f"""Determina se la seguente domanda riguarda il regolamento del fantacalcio.

Regolamento:
{rules_text}

Domanda: {question}

Rispondi solo con "SI" se la domanda riguarda il regolamento, o "NO" se non riguarda il regolamento."""

            response = openai.ChatCompletion.create(
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

    def parse_poll_intent(self, poll_question: str, poll_options: list, rules_text: str, winning_option: str = None, poll_result_summary: str = None, candidate_rules_text: str = None):
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

            response = openai.ChatCompletion.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "Sei un assistente di automazione che analizza sondaggi e restituisce JSON validi."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,
                temperature=0.1
            )
            
            content = response.choices[0].message.content.strip()
            
            # Try to parse JSON response
            try:
                result = json.loads(content)
                return result
            except json.JSONDecodeError:
                print(f"Invalid JSON response from OpenAI: {content}")
                return {
                    "approved": None,
                    "action": None,
                    "rule_number": None,
                    "content": None,
                    "reason": "Errore nel parsing della risposta AI"
                }
            
        except Exception as e:
            print(f"Error parsing poll intent: {e}")
            return {
                "approved": None,
                "action": None,
                "rule_number": None,
                "content": None,
                "reason": f"Errore: {str(e)}"
            }

    def count_tokens(self, text):
        """Estimate token count for a given text"""
        # Rough estimation: 1 token ≈ 4 characters for English/Italian
        return math.ceil(len(text) / 4)

    def is_within_token_limit(self, text, max_tokens=4000):
        """Check if text is within token limit"""
        estimated_tokens = self.count_tokens(text)
        return estimated_tokens <= max_tokens

    def truncate_text_to_tokens(self, text, max_tokens=4000):
        """Truncate text to fit within token limit"""
        if self.is_within_token_limit(text, max_tokens):
            return text
        
        # Truncate to fit within limit
        max_chars = max_tokens * 4
        return text[:max_chars] + "..."
