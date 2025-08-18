# Pedro Bot - Node.js Version

Bot Telegram per Fantacalcio costruito con Node.js e TypeScript, deployato su Netlify Functions.

## 🚀 Funzionalità

- Bot Telegram per gestione regolamento Fantacalcio
- Integrazione con OpenAI per risposte intelligenti
- Database Supabase per persistenza dati
- Sistema di promemoria per i gruppi
- Deploy automatico su Netlify

## 🛠️ Tecnologie

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Telegraf per Telegram Bot API
- **Database**: Supabase
- **AI**: OpenAI API
- **Deploy**: Netlify Functions

## 📁 Struttura Progetto

```
netlify/
├── functions/
│   ├── telegram-webhook.ts      # Webhook principale per Telegram
│   ├── telegram-webhook-local.ts # Versione locale per sviluppo
│   └── services/
│       ├── ai.ts               # Servizio OpenAI
│       └── db.ts               # Servizio database Supabase
```

## 🚀 Setup Locale

1. **Installa dipendenze**:
   ```bash
   npm install
   ```

2. **Configura variabili ambiente**:
   Crea un file `.env` con:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   OPENAI_API_KEY=your_openai_key
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **Avvia in locale**:
   ```bash
   npm start
   ```

## 🌐 Deploy su Netlify

1. **Connetti il repository** a Netlify
2. **Configura le variabili ambiente** nel dashboard Netlify
3. **Deploy automatico** ad ogni push su main

## 📝 Comandi Disponibili

- `/start` - Avvia il bot
- `/help` - Mostra aiuto
- `/regolamento [n]` - Visualizza regole (specifica o tutte)
- `/askpedro [domanda]` - Chiedi al bot
- `/promemoria <testo>` - Salva un promemoria
- `/promemoria_lista` - Lista tutti i promemoria
- `/promemoria_cancella <id>` - Cancella un promemoria
- `/crea_regola <numero> <contenuto>` - Crea o aggiorna una regola (solo admin)
- `/cancella_regola <numero>` - Cancella una regola (solo admin)

> **Nota**: I comandi `/crea_regola` e `/cancella_regola` sono disponibili solo per gli amministratori del gruppo.

## 📝 Script Disponibili

- `npm start` - Avvia il bot in locale
- `npm run build` - Controlla i tipi TypeScript
- `npm run lint` - Esegue ESLint
- `npm run typecheck` - Controlla i tipi

## 🔧 Configurazione

Il progetto usa:
- **ESLint** per linting del codice
- **TypeScript** per type checking
- **Netlify Functions** per il deploy serverless
- **esbuild** per la compilazione automatica

## 📚 Documentazione

- [Netlify Functions](https://docs.netlify.com/functions/overview/)
- [Telegraf](https://telegraf.js.org/)
- [Supabase](https://supabase.com/docs) 