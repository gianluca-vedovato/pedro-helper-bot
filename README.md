# Pedro Bot - Node.js Version

Bot Telegram per Fantacalcio costruito con Node.js e TypeScript, deployato su Netlify Functions.

## 🚀 Funzionalità

- Bot Telegram per gestione regolamento Fantacalcio
- Integrazione con OpenAI per risposte intelligenti
- Sito statico che mostra il regolamento aggiornato
- Deploy automatico su Netlify

## 🛠️ Tecnologie

- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **Framework**: Telegraf per Telegram Bot API
- **Database**: Netlify Blobs (store chiave-valore nativo di Netlify)
- **AI**: OpenAI API
- **Deploy**: Netlify Functions + sito statico

## 📁 Struttura Progetto

```
netlify/
├── functions/
│   ├── telegram-webhook.ts      # Webhook principale per Telegram
│   ├── telegram-webhook-local.ts # Versione locale per sviluppo
│   ├── rules-list.ts            # Endpoint JSON con le regole (usato dal sito)
│   ├── data/
│   │   └── rules.seed.json      # Dati iniziali usati per popolare lo store al primo avvio
│   └── services/
│       ├── ai.ts                # Servizio OpenAI
│       └── rules.ts             # Servizio regole su Netlify Blobs
public/
└── index.html                   # Pagina statica che mostra il regolamento
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
   ```

3. **Avvia in locale**:
   ```bash
   npm start
   ```
   Questo avvia solo il webhook del bot in un server HTTP locale. Netlify Blobs risolve le
   credenziali automaticamente solo quando la funzione gira su Netlify o sotto `netlify dev`:
   per testare in locale anche le scritture delle regole (`/crea_regola`, `/aggiorna_regola`,
   `/cancella_regola`) e la pagina statica, usa invece:
   ```bash
   npx netlify dev
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
- `/crea_regola <tema>` - Crea una nuova regola con l'AI (solo admin)
- `/aggiorna_regola <numero> <tema>` - Aggiorna una regola con l'AI (solo admin)
- `/cancella_regola <numero>` - Cancella una regola (solo admin)

> **Nota**: I comandi `/crea_regola`, `/aggiorna_regola` e `/cancella_regola` sono disponibili solo per gli amministratori del gruppo.

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
- **Netlify Blobs** per la persistenza delle regole
- **esbuild** per la compilazione automatica

## 📚 Documentazione

- [Netlify Functions](https://docs.netlify.com/functions/overview/)
- [Netlify Blobs](https://docs.netlify.com/blobs/overview/)
- [Telegraf](https://telegraf.js.org/)
