# Pedro Bot (Node.js)

Bot Telegram per la gestione di regole e sondaggi, costruito con Node.js e TypeScript.

## 🏗️ Struttura del Progetto

```
pedro/
├── netlify/
│   └── functions/          # Funzioni Netlify (TypeScript)
│       ├── telegram-webhook.ts      # Webhook principale del bot
│       ├── telegram-webhook-local.ts # Versione locale per test
│       ├── status-check.ts          # Controllo stato
│       └── keep-alive.ts            # Mantenimento attivo
├── src/
│   └── services/           # Servizi core
│       ├── ai.ts           # Integrazione AI
│       └── db.ts           # Database operations
└── package.json
```

## 🚀 Sviluppo Locale

### Prerequisiti
- Node.js >= 18
- npm

### Installazione
```bash
npm install
```

### Test Locale
```bash
npm start
```

### Build delle Funzioni
```bash
npm run build:functions
```

### Type Checking
```bash
npm run typecheck
```

## 🌐 Deploy su Netlify

Il progetto è configurato per compilare automaticamente i file TypeScript durante il deploy:

1. **Build automatico**: Netlify compila i file `.ts` in `.js` usando esbuild
2. **Nessun file duplicato**: Solo i file TypeScript vengono committati
3. **Deploy pulito**: I file compilati vengono generati automaticamente

### Variabili d'Ambiente
Configura in Netlify:
- `BOT_TOKEN` - Token del bot Telegram
- `OPENAI_API_KEY` - Chiave API OpenAI
- `SUPABASE_URL` - URL Supabase
- `SUPABASE_ANON_KEY` - Chiave anonima Supabase

## 📝 Comandi del Bot

- `/start` - Avvio bot
- `/help` - Aiuto
- `/regolamento [n]` - Visualizza regole
- `/askpedro [domanda]` - Chiedi al bot
- `/applica_sondaggio` - Applica risultati sondaggio
- `/promemoria` - Gestione promemoria

## 🔧 Workflow di Sviluppo

1. **Modifica** i file `.ts` in `netlify/functions/`
2. **Testa localmente** con `npm start`
3. **Commit** solo i file TypeScript
4. **Deploy** su Netlify (compilazione automatica)

## 📚 Tecnologie

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Telegraf (Telegram Bot API)
- **AI**: OpenAI GPT
- **Database**: Supabase
- **Deploy**: Netlify Functions 