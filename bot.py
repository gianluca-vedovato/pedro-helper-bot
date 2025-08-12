import logging
import re
import json
import shlex
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import Updater, CommandHandler, MessageHandler, PollHandler, CallbackQueryHandler, Filters, CallbackContext
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
    
    def start(self, update: Update, context: CallbackContext):
        """Send a message when the command /start is issued."""
        welcome_message = """Ciao! Sono Pedro, il tuo assistente per il canale fantacalcio! 🏆

Comandi disponibili:
/regolamento [numero] - Mostra il regolamento completo o una regola specifica
/askpedro [domanda] - Fai una domanda sul regolamento
/help - Mostra questo messaggio di aiuto

Il regolamento è già caricato e pronto all'uso! 🚀"""
        
        update.message.reply_text(welcome_message)
    
    def help_command(self, update: Update, context: CallbackContext):
        """Send a message when the command /help is issued."""
        help_text = """📚 **Comandi disponibili:**

/start - Avvia il bot e mostra il messaggio di benvenuto
/help - Mostra tutti i comandi disponibili
/regolamento [numero] - Mostra il regolamento completo o una regola specifica
/askpedro [domanda] - Fai una domanda sui regolamenti

📝 **Promemoria**
/promemoria <testo> - Salva un promemoria per il prossimo anno
/promemoria_lista - Elenca i promemoria del gruppo
/promemoria_cancella <id> - Cancella un promemoria (autore o admin)

💡 **Come funziona:**
1. Il regolamento è già caricato nel sistema
2. Usa /regolamento per visualizzarlo
3. Fai domande con /askpedro"""
        
        update.message.reply_text(help_text, parse_mode='Markdown')

    def _is_user_admin(self, chat_id: int, user_id: int, context: CallbackContext) -> bool:
        try:
            member = context.bot.get_chat_member(chat_id=chat_id, user_id=user_id)
            status = getattr(member, 'status', '')
            return status in ('administrator', 'creator', 'owner')
        except Exception:
            return False

    def on_poll_created(self, update: Update, context: CallbackContext):
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

    def regolamento_command(self, update: Update, context: CallbackContext):
        """Show the complete regulation or a specific rule."""
        try:
            # Check if a specific rule number was requested
            if context.args:
                rule_number = int(context.args[0])
                rule_content = self.db.get_rule(rule_number)
                
                if rule_content:
                    response = f"📋 **Regola {rule_number}:**\n\n{rule_content}"
                else:
                    response = f"❌ Regola {rule_number} non trovata. Usa /regolamento per vedere tutte le regole disponibili."
            else:
                # Show all rules
                rules = self.db.get_all_rules()
                
                if rules:
                    response = "📚 **Regolamento Completo Fantacalcio:**\n\n"
                    for rule_num, content in rules:
                        # Truncate long content for overview
                        preview = content[:100] + "..." if len(content) > 100 else content
                        response += f"**{rule_num}.** {preview}\n\n"
                    
                    response += "💡 **Per vedere una regola specifica:** /regolamento [numero]"
                else:
                    response = "❌ Nessuna regola trovata nel database."
            
            update.message.reply_text(response, parse_mode='Markdown')
            
        except ValueError:
            update.message.reply_text("❌ Numero regola non valido. Usa: /regolamento [numero]")
        except Exception as e:
            logger.error(f"Error in regolamento_command: {e}")
            update.message.reply_text("❌ Errore interno. Riprova più tardi.")

    def askpedro_command(self, update: Update, context: CallbackContext):
        """Ask Pedro a question about the regulations."""
        if not context.args:
            update.message.reply_text("💡 **Come usare:** /askpedro [la tua domanda]\n\nEsempi:\n• /askpedro Quanto costa un giocatore?\n• /askpedro Come funziona l'asta?\n• /askpedro Quali sono le penalità?")
            return
        
        question = " ".join(context.args)
        
        try:
            # Get all rules for context
            rules = self.db.get_all_rules()
            if not rules:
                update.message.reply_text("❌ Regolamento non disponibile al momento.")
                return
            
            # Format rules for AI context
            rules_text = "\n\n".join([f"Regola {num}: {content}" for num, content in rules])
            
            # Ask AI
            ai_response = self.openai_helper.ask_question(question, rules_text)
            
            if ai_response:
                response = f"🤖 **Pedro risponde:**\n\n{ai_response}\n\n💡 *Domanda:* {question}"
            else:
                response = "❌ Mi dispiace, non riesco a rispondere al momento. Riprova più tardi."
            
            update.message.reply_text(response, parse_mode='Markdown')
            
        except Exception as e:
            logger.error(f"Error in askpedro_command: {e}")
            update.message.reply_text("❌ Errore interno. Riprova più tardi.")

    def promemoria_command(self, update: Update, context: CallbackContext):
        """Save a reminder for next year."""
        if not context.args:
            update.message.reply_text("💡 **Come usare:** /promemoria [testo del promemoria]\n\nEsempio: /promemoria Ricordati di portare la birra!")
            return
        
        text = " ".join(context.args)
        chat_id = update.effective_chat.id
        user_id = update.effective_user.id
        user_name = update.effective_user.first_name or "Sconosciuto"
        
        try:
            reminder_id = self.db.add_reminder(chat_id, user_id, user_name, text)
            
            if reminder_id:
                response = f"✅ **Promemoria salvato!**\n\n📝 **Testo:** {text}\n🆔 **ID:** {reminder_id}\n👤 **Autore:** {user_name}\n\n💡 **Per eliminarlo:** /promemoria_cancella {reminder_id}"
            else:
                response = "❌ Errore nel salvare il promemoria. Riprova più tardi."
            
            update.message.reply_text(response, parse_mode='Markdown')
            
        except Exception as e:
            logger.error(f"Error in promemoria_command: {e}")
            update.message.reply_text("❌ Errore interno. Riprova più tardi.")

    def promemoria_lista_command(self, update: Update, context: CallbackContext):
        """List all reminders for the current chat."""
        chat_id = update.effective_chat.id
        
        try:
            reminders = self.db.list_reminders(chat_id)
            
            if reminders:
                response = "📋 **Promemoria del gruppo:**\n\n"
                for reminder in reminders:
                    # Format date
                    created_at = reminder.get('created_at', 'N/A')
                    if isinstance(created_at, str):
                        created_at = created_at[:10]  # Just date part
                    
                    response += f"🆔 **{reminder['id']}** - {reminder['user_name']}\n"
                    response += f"📝 {reminder['text']}\n"
                    response += f"📅 {created_at}\n\n"
                
                response += "💡 **Per eliminare:** /promemoria_cancella [ID]"
            else:
                response = "📭 Nessun promemoria salvato per questo gruppo."
            
            update.message.reply_text(response, parse_mode='Markdown')
            
        except Exception as e:
            logger.error(f"Error in promemoria_lista_command: {e}")
            update.message.reply_text("❌ Errore interno. Riprova più tardi.")

    def promemoria_cancella_command(self, update: Update, context: CallbackContext):
        """Delete a specific reminder."""
        if not context.args:
            update.message.reply_text("💡 **Come usare:** /promemoria_cancella [ID]\n\nEsempio: /promemoria_cancella 1")
            return
        
        try:
            reminder_id = int(context.args[0])
            chat_id = update.effective_chat.id
            user_id = update.effective_user.id
            
            # Check if user is admin
            is_admin = self._is_user_admin(chat_id, user_id, context)
            
            # Try to delete
            success = self.db.delete_reminder(chat_id, reminder_id, user_id, is_admin)
            
            if success:
                response = f"✅ **Promemoria {reminder_id} eliminato!**"
            else:
                response = "❌ Promemoria non trovato o non hai i permessi per eliminarlo."
            
            update.message.reply_text(response, parse_mode='Markdown')
            
        except ValueError:
            update.message.reply_text("❌ ID promemoria non valido. Usa un numero.")
        except Exception as e:
            logger.error(f"Error in promemoria_cancella_command: {e}")
            update.message.reply_text("❌ Errore interno. Riprova più tardi.")

    def run(self):
        """Start the bot."""
        # Create the Updater and pass it your bot's token
        updater = Updater(BOT_TOKEN, use_context=True)
        
        # Get the dispatcher to register handlers
        dp = updater.dispatcher
        
        # Add command handlers
        dp.add_handler(CommandHandler("start", self.start))
        dp.add_handler(CommandHandler("help", self.help_command))
        dp.add_handler(CommandHandler("regolamento", self.regolamento_command))
        dp.add_handler(CommandHandler("askpedro", self.askpedro_command))
        dp.add_handler(CommandHandler("promemoria", self.promemoria_command))
        dp.add_handler(CommandHandler("promemoria_lista", self.promemoria_lista_command))
        dp.add_handler(CommandHandler("promemoria_cancella", self.promemoria_cancella_command))
        
        # Add poll handler
        dp.add_handler(PollHandler(self.on_poll_created))
        
        # Start the Bot
        updater.start_polling()
        
        # Run the bot until you send a signal to stop
        updater.idle()

def main():
    """Start the bot."""
    bot = FantacalcioBot()
    bot.run()

if __name__ == '__main__':
    main()
