import logging
import re
import json
import shlex
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import Application, CommandHandler, MessageHandler, PollHandler, CallbackQueryHandler, filters, ContextTypes
from database import Database
from openai_helper import OpenAIHelper
from config import BOT_TOKEN

# Enable logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

class FantacalcioBot:
    def __init__(self):
        self.db = Database()
        self.openai_helper = OpenAIHelper()
    
    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Send a message when the command /start is issued."""
        welcome_message = """Ciao! Sono Pedro, il tuo assistente per il canale fantacalcio! 🏆

Comandi disponibili:
/regolamento [numero] - Mostra il regolamento completo o una regola specifica
/askpedro [domanda] - Fai una domanda sul regolamento
/help - Mostra questo messaggio di aiuto

Il regolamento è già caricato e pronto all'uso! 🚀"""
        
        await update.message.reply_text(welcome_message)
    
    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Send a message when the command /help is issued."""
        help_text = """📚 **Comandi disponibili:**

/start - Avvia il bot e mostra il messaggio di benvenuto
/help - Mostra tutti i comandi disponibili
/regolamento [numero] - Mostra il regolamento completo o una regola specifica
/askpedro [domanda] - Fai una domanda sui regolamenti
\n
📝 **Promemoria**
/promemoria <testo> - Salva un promemoria per il prossimo anno
/promemoria_lista - Elenca i promemoria del gruppo
/promemoria_cancella <id> - Cancella un promemoria (autore o admin)

💡 **Come funziona:**
1. Il regolamento è già caricato nel sistema
2. Usa /regolamento per visualizzarlo
3. Fai domande con /askpedro"""
        
        await update.message.reply_text(help_text, parse_mode='Markdown')
    
    # Rimosso parser euristico: la decisione è demandata interamente all'AI (function calling)

    async def _is_user_admin(self, chat_id: int, user_id: int, context: ContextTypes.DEFAULT_TYPE) -> bool:
        try:
            member = await context.bot.get_chat_member(chat_id=chat_id, user_id=user_id)
            status = getattr(member, 'status', '')
            return status in ('administrator', 'creator', 'owner')
        except Exception:
            return False

    async def on_poll_created(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Triggered when a poll is sent in a chat where the bot can read messages."""
        if not update.message or not update.message.poll:
            return

        poll = update.message.poll
        poll_id = poll.id
        question = poll.question or ''
        chat_id = update.effective_chat.id
        message_id = update.message.message_id
        creator_user_id = update.effective_user.id if update.effective_user else None

        print(f"🔍 Poll detected: ID={poll_id}, Question='{question}', Chat={chat_id}")

        # Persist poll metadata for future application
        try:
            # Save poll with full context (question + options)
            options_texts = [opt.text for opt in (poll.options or [])]
            self.db.save_poll(
                poll_id=poll_id,
                chat_id=chat_id,
                message_id=message_id,
                creator_user_id=creator_user_id,
                rule_number=None,
                action=None,
                proposed_content=None,
                question=question,
                options_json=json.dumps(options_texts, ensure_ascii=False),
            )
            print(f"✅ Poll saved to database: {poll_id}")
        except Exception as e:
            print(f"❌ Error saving poll: {e}")
            # Don't ignore persistence errors - we need to know what's wrong
            import traceback
            traceback.print_exc()

        # Build helper message
        parsed_info = ""

        cmd = f"/applica_sondaggio {poll_id}"
        text = (
            f"🗳️ Sondaggio registrato{parsed_info}.\n"
            f"ID: `{poll_id}`\n"
            f"Per applicare i risultati: {cmd} (solo admin)"
        )
        # Escape special characters that might break Markdown
        safe_text = text.replace('_', '\\_').replace('*', '\\*').replace('`', '\\`').replace('[', '\\[').replace(']', '\\]')

        # Inline button for easy apply
        keyboard = InlineKeyboardMarkup(
            [[InlineKeyboardButton(text="Applica sondaggio", callback_data=f"apply:{poll_id}")]]
        )
        await update.message.reply_text(safe_text, parse_mode='Markdown', reply_markup=keyboard)

    async def on_poll_update(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Triggered on any poll update (vote changes/closed)."""
        if not update.poll:
            return
        poll = update.poll
        
        # Collect results
        results = {opt.text: opt.voter_count for opt in (poll.options or [])}
        
        try:
            self.db.update_poll_results(
                poll_id=poll.id,
                is_closed=poll.is_closed,
                results_json=json.dumps(results, ensure_ascii=False),
            )
        except Exception as e:
            print(f"❌ Errore nel salvare risultati: {e}")
            import traceback
            traceback.print_exc()

    async def applica_sondaggio(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Applica i risultati di un sondaggio alle regole (solo admin). Uso: /applica_sondaggio <poll_id>"""
        message = update.message
        if not message:
            return

        chat_id = update.effective_chat.id
        user_id = update.effective_user.id

        if not await self._is_user_admin(chat_id, user_id, context):
            await message.reply_text("❌ Solo gli amministratori possono applicare un sondaggio.")
            return

        poll_id = None
        if context.args:
            poll_id = context.args[0]
        elif message.reply_to_message and message.reply_to_message.poll:
            poll_id = message.reply_to_message.poll.id
        else:
            await message.reply_text("Uso: /applica_sondaggio <poll_id>\nOppure rispondi direttamente al messaggio del sondaggio con /applica_sondaggio")
            return
        print(f"🔍 Looking for poll: {poll_id}")
        poll_row = self.db.get_poll(poll_id)
        print(f"📊 Poll row from DB: {poll_row}")
        if not poll_row:
            # Fallback: if admin is replying to the poll message, save it now
            if message.reply_to_message and message.reply_to_message.poll:
                rp = message.reply_to_message
                rp_poll = rp.poll
                try:
                    options_texts = [opt.text for opt in (rp_poll.options or [])]
                except Exception:
                    options_texts = []
                try:
                    self.db.save_poll(
                        poll_id=rp_poll.id,
                        chat_id=update.effective_chat.id,
                        message_id=rp.message_id,
                        creator_user_id=rp.from_user.id if rp.from_user else None,
                        rule_number=None,
                        action=None,
                        proposed_content=None,
                        question=rp_poll.question or '',
                        options_json=json.dumps(options_texts, ensure_ascii=False),
                    )
                    poll_row = self.db.get_poll(rp_poll.id)
                    print(f"🆕 Poll saved on-demand: {poll_row}")
                except Exception as e:
                    print(f"❌ Failed to save replied poll: {e}")
                    poll_row = None

            if not poll_row:
                await message.reply_text("❌ Sondaggio non trovato nel database. Rispondi al messaggio del sondaggio con /applica_sondaggio oppure riprova più tardi.")
                return

        # Gather full context for AI parsing
        rules = self.db.get_all_rules()
        rules_text = "\n\n".join([f"{num}. {content}" for num, content in rules])
        question = poll_row.get('question') or ''
        try:
            options_list = json.loads(poll_row.get('options_json') or '[]')
        except Exception:
            options_list = []

        # Determine winning option and summary for AI
        results_json = poll_row.get('results_json')
        results = {}
        if results_json:
            try:
                results = json.loads(results_json)
            except Exception:
                results = {}
        sorted_opts = sorted(results.items(), key=lambda kv: kv[1], reverse=True) if results else []
        winning_option = sorted_opts[0][0] if sorted_opts else None
        poll_result_summary = ", ".join([f"{opt}: {count}" for opt, count in sorted_opts]) if sorted_opts else None

        # Optionally, we could compute candidate rules here; for ora, lasciamo piena libertà all'AI
        candidate_rules_text = None

        # Compact poll detail log
        print("[Sondaggio] Domanda:", question)
        print("[Sondaggio] Opzioni:", options_list)
        if poll_result_summary:
            print("[Sondaggio] Risultati:", poll_result_summary)
        
        tool_calls = self.openai_helper.decide_rule_action_with_tools(
            poll_question=question,
            poll_options=options_list,
            rules_text=rules_text,
            winning_option=winning_option,
            poll_result_summary=poll_result_summary,
            candidate_rules_text=candidate_rules_text,
        )
        print(f"[AI] Tool calls parsed: {tool_calls}")

        # Translate tool-calls to action/number/content
        action = None
        rule_number = None
        proposed_content = None
        for call in tool_calls:
            name = call.get('name')
            args = call.get('arguments') or {}
            if name == 'remove_rule':
                action = 'remove'
                rule_number = args.get('rule_number')
                break
            if name == 'update_rule':
                action = 'update'
                rule_number = args.get('rule_number')
                proposed_content = args.get('content')
                break
            if name == 'add_rule':
                action = 'add'
                rule_number = args.get('rule_number')
                proposed_content = args.get('content')
                break
        if not action:
            await message.reply_text("❌ Non sono riuscito a capire l'azione dal sondaggio. Riformula la domanda o rendi più chiare le opzioni (es. sì/no).")
            return

        # Consider approved because action is explicitly triggered dall'admin
        approved = True

        # Ensure we at least have hints from stored poll if tool-calls didn't provide a field
        if (rule_number is None) and (poll_row.get('rule_number') is not None):
            rule_number = poll_row.get('rule_number')
        if not proposed_content and poll_row.get('proposed_content'):
            proposed_content = poll_row.get('proposed_content')

        # Do NOT auto-identify. We rely solely on the AI tool-call for decision.

        if not approved:
            await message.reply_text("🛑 Il sondaggio non è stato approvato dalla maggioranza. Nessuna modifica applicata.")
            return

        if action == 'remove':
            if rule_number is None:
                await message.reply_text("❌ Sondaggio di rimozione senza numero di regola.")
                return
            if not self.db.rule_exists(rule_number):
                await message.reply_text(f"ℹ️ La regola {rule_number} non esiste già. Nessuna rimozione effettuata.")
                return
            ok = self.db.delete_rule(rule_number)
            if ok:
                await message.reply_text(f"✅ Regola {rule_number} rimossa con successo.")
            else:
                await message.reply_text(f"❌ Errore nella rimozione della regola {rule_number}.")
            return

        # Add/Update path
        if rule_number is None:
            # If no number was specified, auto-assign next available
            rule_number = self.db.get_next_rule_number()

        if not proposed_content:
            await message.reply_text("❌ Nessun contenuto proposto trovato nel sondaggio. Usa la forma: 'Regola N: testo...' oppure 'Nuova regola: testo...'")
            return

        ok = self.db.add_rule(rule_number, proposed_content)
        if ok:
            existed = self.db.rule_exists(rule_number)
            verb = "aggiornata" if existed else "aggiunta"
            await message.reply_text(f"✅ Regola {rule_number} {verb} con successo.")
            
            # Show the new/updated rule content
            if existed:
                await message.reply_text(f"📋 **Regola {rule_number} aggiornata:**\n\n{proposed_content}", parse_mode='Markdown')
            else:
                await message.reply_text(f"📋 **Nuova regola {rule_number}:**\n\n{proposed_content}", parse_mode='Markdown')
        else:
            await message.reply_text("❌ Errore durante il salvataggio della regola.")

    async def on_callback_button(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        query = update.callback_query
        if not query or not query.data:
            return
        try:
            data = query.data
            if data.startswith("apply:"):
                poll_id = data.split(":", 1)[1]
                chat_id = query.message.chat_id
                user_id = query.from_user.id if query.from_user else None
                if not await self._is_user_admin(chat_id, user_id, context):
                    await query.answer("Solo gli admin possono applicare.", show_alert=True)
                    return
                # Synthesize a fake message-like object for reuse of applica_sondaggio
                class _Dummy:
                    def __init__(self, chat_id):
                        self.chat = type("_C", (), {"id": chat_id})
                        self.message = query.message
                    @property
                    def effective_chat(self):
                        return self.chat
                # We can't directly call applica_sondaggio with args; set context.args
                context.args = [poll_id]
                # Provide a minimal Update-like with message
                await self.applica_sondaggio(update=Update(update.update_id, message=query.message), context=context)
                await query.answer()
        except Exception as e:
            print(f"❌ Callback error: {e}")
    
    async def sondaggio_manuale(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Applica manualmente un sondaggio passato come testo.
        Uso:
        /sondaggio_manuale "Domanda" "Opzione vincente" ["Opzione1|Opzione2|..."]
        (solo admin)
        """
        message = update.message
        if not message:
            return
        chat_id = update.effective_chat.id
        user_id = update.effective_user.id
        if not await self._is_user_admin(chat_id, user_id, context):
            await message.reply_text("❌ Solo gli amministratori possono applicare un sondaggio manuale.")
            return

        try:
            tokens = shlex.split(message.text)
        except Exception:
            tokens = []
        # Remove command token if present
        if tokens and tokens[0].startswith('/'):
            tokens = tokens[1:]
        if len(tokens) < 2:
            await message.reply_text(
                "Uso: /sondaggio_manuale \"Domanda\" \"Opzione vincente\" [\"Opz1|Opz2|...\"]"
            )
            return

        question = tokens[0]
        winning_option = tokens[1]
        options_list = None
        if len(tokens) >= 3:
            options_list = [opt.strip() for opt in tokens[2].split('|') if opt.strip()]

        # Rules context
        rules = self.db.get_all_rules()
        rules_text = "\n\n".join([f"{num}. {content}" for num, content in rules])

        # Log compact detail
        print("[Sondaggio Manuale] Domanda:", question)
        print("[Sondaggio Manuale] Vincente:", winning_option)
        if options_list:
            print("[Sondaggio Manuale] Opzioni:", options_list)

        tool_calls = self.openai_helper.decide_rule_action_with_tools(
            poll_question=question,
            poll_options=options_list,
            rules_text=rules_text,
            winning_option=winning_option,
            poll_result_summary=None,
            candidate_rules_text=None,
        )
        print(f"[AI] Tool calls parsed (manual): {tool_calls}")

        action = None
        rule_number = None
        proposed_content = None
        for call in tool_calls:
            name = call.get('name')
            args = call.get('arguments') or {}
            if name == 'remove_rule':
                action = 'remove'
                rule_number = args.get('rule_number')
                break
            if name == 'update_rule':
                action = 'update'
                rule_number = args.get('rule_number')
                proposed_content = args.get('content')
                break
            if name == 'add_rule':
                action = 'add'
                rule_number = args.get('rule_number')
                proposed_content = args.get('content')
                break

        if not action:
            await message.reply_text(
                "❌ Non sono riuscito a capire l'azione dal testo. Assicurati di passare \"Domanda\" e \"Opzione vincente\" (e opzionalmente le opzioni)."
            )
            return

        # Consider approved (azione esplicita dell'admin)
        if action == 'remove':
            if rule_number is None:
                await message.reply_text("❌ Rimozione senza numero di regola. Specifica una domanda/risposta che identifichi chiaramente la regola.")
                return
            if not self.db.rule_exists(rule_number):
                await message.reply_text(f"ℹ️ La regola {rule_number} non esiste. Nessuna rimozione effettuata.")
                return
            ok = self.db.delete_rule(rule_number)
            if ok:
                await message.reply_text(f"✅ Regola {rule_number} rimossa con successo.")
            else:
                await message.reply_text(f"❌ Errore nella rimozione della regola {rule_number}.")
            return

        # Add/Update path
        if action in ('add', 'update'):
            if not proposed_content:
                await message.reply_text("❌ Nessun contenuto proposto generato. Rendi più chiara la domanda/risposta.")
                return
            if action == 'add' and rule_number is None:
                rule_number = self.db.get_next_rule_number()
            if rule_number is None:
                await message.reply_text("❌ Modifica senza numero di regola. Rendi più chiara la domanda/risposta o specifica meglio la regola.")
                return
            ok = self.db.add_rule(rule_number, proposed_content)
            if ok:
                existed = self.db.rule_exists(rule_number)
                verb = "aggiornata" if existed else "aggiunta"
                await message.reply_text(f"✅ Regola {rule_number} {verb} con successo.")
                if existed:
                    await message.reply_text(f"📋 **Regola {rule_number} aggiornata:**\n\n{proposed_content}", parse_mode='Markdown')
                else:
                    await message.reply_text(f"📋 **Nuova regola {rule_number}:**\n\n{proposed_content}", parse_mode='Markdown')
            else:
                await message.reply_text("❌ Errore durante il salvataggio della regola.")
            return
    
    async def promemoria(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Aggiunge un promemoria al gruppo. Uso: /promemoria <testo>"""
        message = update.message
        if not message:
            return
        if not context.args:
            await message.reply_text("Uso: /promemoria <testo del promemoria>")
            return
        text = ' '.join(context.args).strip()
        if not text:
            await message.reply_text("❌ Testo del promemoria vuoto.")
            return
        chat_id = update.effective_chat.id
        user = update.effective_user
        user_id = user.id if user else 0
        user_name = (getattr(user, 'username', None) or '').strip()
        if not user_name:
            first_name = getattr(user, 'first_name', '') if user else ''
            last_name = getattr(user, 'last_name', '') if user else ''
            user_name = f"{first_name} {last_name}".strip() or "Utente"
        reminder_id = self.db.add_reminder(chat_id=chat_id, user_id=user_id, user_name=user_name, text=text)
        if reminder_id:
            await message.reply_text(f"✅ Promemoria salvato (#{reminder_id})\n{text}")
        else:
            await message.reply_text("❌ Errore nel salvataggio del promemoria.")

    async def promemoria_lista(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Elenca i promemoria del gruppo."""
        message = update.message
        if not message:
            return
        chat_id = update.effective_chat.id
        reminders = self.db.list_reminders(chat_id)
        if not reminders:
            await message.reply_text("Nessun promemoria salvato per questo gruppo.")
            return
        header = "📝 Promemoria salvati:\n\n"
        lines = []
        for r in reminders:
            author = r.get('user_name') or 'Utente'
            rid = r.get('id')
            text = r.get('text') or ''
            created = r.get('created_at') or ''
            lines.append(f"{rid}. {text}\n   — {author} • {created}")
        response = header + "\n".join(lines)
        # Split long messages if needed
        if len(response) > 4096:
            chunks = [response[i:i+4096] for i in range(0, len(response), 4096)]
            for chunk in chunks:
                await message.reply_text(chunk)
        else:
            await message.reply_text(response)

    async def promemoria_cancella(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Cancella un promemoria per id. Uso: /promemoria_cancella <id> (autore o admin)"""
        message = update.message
        if not message:
            return
        if not context.args:
            await message.reply_text("Uso: /promemoria_cancella <id>")
            return
        try:
            reminder_id = int(context.args[0])
        except Exception:
            await message.reply_text("❌ ID non valido.")
            return
        chat_id = update.effective_chat.id
        requester_user_id = update.effective_user.id if update.effective_user else 0
        is_admin = await self._is_user_admin(chat_id, requester_user_id, context)
        ok = self.db.delete_reminder(chat_id=chat_id, reminder_id=reminder_id, requester_user_id=requester_user_id, is_admin=is_admin)
        if ok:
            await message.reply_text("✅ Promemoria cancellato.")
        else:
            await message.reply_text("❌ Promemoria non trovato o non autorizzato a cancellarlo.")
    async def regolamento(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Show rulebook or specific rule"""
        if context.args:
            try:
                rule_number = int(context.args[0])
                rule_content = self.db.get_rule(rule_number)
                
                if rule_content:
                    # Formatta la regola per una migliore leggibilità
                    formatted_content = self.format_rule_content(rule_content)
                    response = f"📋 **Regola {rule_number}:**\n\n{formatted_content}"
                    await update.message.reply_text(response, parse_mode='Markdown')
                else:
                    await update.message.reply_text(f"❌ Regola {rule_number} non trovata.")
            except ValueError:
                await update.message.reply_text("❌ Numero regola non valido.")
        else:
            # Show all rules
            rules = self.db.get_all_rules()
            
            if not rules:
                await update.message.reply_text("❌ Nessuna regola caricata nel sistema. Contatta l'amministratore.")
                return
            
            response = "📚 **Regolamento Completo:**\n\n"
            for rule_num, content in rules:
                formatted_content = self.format_rule_content(content)
                response += f"**{rule_num}.** {formatted_content}\n\n"
            
            # Split long messages if needed
            if len(response) > 4096:
                chunks = [response[i:i+4096] for i in range(0, len(response), 4096)]
                for chunk in chunks:
                    await update.message.reply_text(chunk, parse_mode='Markdown')
            else:
                await update.message.reply_text(response, parse_mode='Markdown')
    
    def format_rule_content(self, content):
        """Formatta il contenuto della regola per una migliore leggibilità"""
        # Sostituisce caratteri Unicode con caratteri standard
        formatted = content.replace('○', '•')
        formatted = formatted.replace('●', '•')
        
        # Va a capo prima di ogni punto elenco per una migliore leggibilità
        formatted = formatted.replace(' •', '\n•')
        
        # Aggiunge spazi dopo i punti elenco
        formatted = formatted.replace('•', '• ')
        
        # Formatta le liste con spazi appropriati
        formatted = formatted.replace('  ', ' ')  # Rimuove spazi doppi
        
        return formatted
    
    async def askpedro(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Ask Pedro about the rules"""
        if not context.args:
            await update.message.reply_text("❌ Uso: /askpedro [domanda]")
            return
        
        question = ' '.join(context.args)
        
        # Get all rules for context
        rules = self.db.get_all_rules()
        if not rules:
            await update.message.reply_text("❌ Nessuna regola caricata nel sistema. Contatta l'amministratore.")
            return
        
        # Convert rules to text
        rules_text = "\n\n".join([f"{num}. {content}" for num, content in rules])
        
        # Check if question is rulebook-related
        if not self.openai_helper.is_rulebook_question(question, rules_text):
            await update.message.reply_text("Non nel regolamento")
            return
        
        # Show typing indicator
        await context.bot.send_chat_action(chat_id=update.effective_chat.id, action="typing")
        
        # Get answer from OpenAI
        answer = self.openai_helper.ask_about_rules(question, rules_text)
        
        await update.message.reply_text(f"🤖 **Pedro dice:**\n\n{answer}", parse_mode='Markdown')
    
    def run(self):
        """Start the bot"""
        # Create the Application
        application = Application.builder().token(BOT_TOKEN).build()
        
        # Add handlers
        application.add_handler(CommandHandler("start", self.start))
        application.add_handler(CommandHandler("help", self.help_command))
        application.add_handler(CommandHandler("regolamento", self.regolamento))
        application.add_handler(CommandHandler("askpedro", self.askpedro))
        application.add_handler(CommandHandler("promemoria", self.promemoria))
        application.add_handler(CommandHandler("promemoria_lista", self.promemoria_lista))
        application.add_handler(CommandHandler("promemoria_cancella", self.promemoria_cancella))
        application.add_handler(MessageHandler(filters.POLL, self.on_poll_created))
        application.add_handler(PollHandler(self.on_poll_update))
        application.add_handler(CallbackQueryHandler(self.on_callback_button))
        application.add_handler(CommandHandler("applica_sondaggio", self.applica_sondaggio))
        application.add_handler(CommandHandler("sondaggio_manuale", self.sondaggio_manuale))
        
        # Start the bot with error handling
        try:
            print("🚀 Avvio bot...")
            print("📊 Handler configurati:")
            print("   - TEXT: Gestione messaggi e comandi")
            
            application.run_polling(
                allowed_updates=Update.ALL_TYPES,
                drop_pending_updates=True,  # Ignora aggiornamenti pendenti
                close_loop=False
            )
        except Exception as e:
            print(f"Error starting bot: {e}")
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    bot = FantacalcioBot()
    bot.run() 