# Pedro - Bot Telegram per Gestione Regolamenti Fantacalcio

Pedro è un bot Telegram intelligente che gestisce regole per il fantacalcio utilizzando l'intelligenza artificiale di OpenAI.

## 🚀 Funzionalità Principali

### 📋 Gestione Regolamenti
- **Regole dinamiche**: Aggiungi, modifica o elimina regole
- **Consultazione intelligente**: Fai domande al bot sui regolamenti
- **Gestione completa**: Visualizza e gestisci tutto il regolamento

### 🤖 Intelligenza Artificiale
- **OpenAI GPT**: Utilizza GPT per fornire risposte intelligenti
- **Analisi contestuale**: Comprende il contesto del fantacalcio
- **Risposte precise**: Fornisce risposte accurate alle domande sui regolamenti

## 🛠️ Installazione

### Prerequisiti
- Python 3.8+
- Token bot Telegram
- Chiave API OpenAI

### Setup
1. **Clona il repository**
   ```bash
   git clone <repository-url>
   cd pedro
   ```

2. **Installa le dipendenze**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configura le variabili d'ambiente**
   ```bash
   cp env_example.txt .env
   # Modifica .env con i tuoi token
   ```

4. **Avvia il bot**
   ```bash
   python bot.py
   ```

## 🚀 Deploy (Node + Netlify Functions) — Consigliato per deploy gratuito

Questa versione prevede un webhook serverless su Netlify Functions scritto in Node, integrato con Supabase e OpenAI.

### Requisiti
- Node 18+
- Netlify (free tier)
- Supabase (free tier)
- OpenAI API Key

### Setup Supabase
1. Apri Supabase > SQL Editor
2. Esegui `supabase_setup.sql` (crea tabelle `rules`, `reminders`, `polls` e policy di esempio)

### Variabili d'ambiente (Netlify)
Impostale nella Dashboard Netlify (Site settings > Build & deploy > Environment):
- `BOT_TOKEN` (Telegram)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (es. `gpt-4o-mini`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### Deploy
1. Effettua il deploy su Netlify (repo connesso o drag-and-drop). Le Functions sono in `netlify/functions/`.
2. L’endpoint del webhook sarà:
   - `https://<site>.netlify.app/.netlify/functions/telegram-webhook`
3. Imposta il webhook Telegram:
   ```bash
   curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
     -d url="https://<site>.netlify.app/.netlify/functions/telegram-webhook"
   ```

### Test locale (facoltativo)
```bash
npm install
npm start
# POST di prova:
curl -X POST http://localhost:8787 -H 'content-type: application/json' -d '{"update_id":1,"message":{"message_id":1,"chat":{"id":123},"text":"/start"}}'
```

### Comandi supportati (Node)
- `/start`, `/help`
- `/regolamento [numero]`
- `/askpedro [domanda]`
- `/promemoria`, `/promemoria_lista`, `/promemoria_cancella <id>`
- Sondaggi: salvataggio automatico, aggiornamento risultati, pulsante “Applica sondaggio”, `/applica_sondaggio <poll_id>`, `sondaggio_manuale` con AI tool-calling per `add/update/remove` regole. La risposta include la nuova/aggiornata regola.

## 📱 Comandi Disponibili

### Comandi Base
- `/start` - Avvia il bot e mostra il messaggio di benvenuto
- `/help` - Mostra tutti i comandi disponibili

### Gestione Regolamenti
- `/regolamento [numero]` - Mostra il regolamento completo o una regola specifica
- `/askpedro [domanda]` - Fai una domanda sui regolamenti

### Promemoria
- `/promemoria <testo>` - Salva un promemoria per il prossimo anno (nel gruppo corrente)
- `/promemoria_lista` - Elenca tutti i promemoria del gruppo
- `/promemoria_cancella <id>` - Cancella un promemoria. Può farlo l'autore o un admin del gruppo

## 🔧 Configurazione

### File .env
```env
BOT_TOKEN=your_telegram_bot_token_here
OPENAI_API_KEY=your_openai_api_key_here
DATABASE_PATH=fantacalcio_bot.db
OPENAI_MODEL=gpt-3.5-turbo
MAX_TOKENS=500
```

### Database
Il sistema utilizza SQLite per memorizzare:
- **Regole**: Contenuto e numerazione delle regole
- **Promemoria**: Note rapide per il prossimo anno, legate al gruppo che le ha create

## 🧪 Test

Esegui i test per verificare il funzionamento:

```bash
python test_simple.py
```

## 📊 Come Funziona

### 1. Gestione Regole
- Le regole sono memorizzate nel database
- Usa `/regolamento` per visualizzarle
- Ogni regola ha un numero identificativo

### 2. Consultazione
- Usa `/askpedro` per fare domande sui regolamenti
- Il bot fornisce risposte intelligenti basate sulle regole esistenti

## 🔍 Debug e Troubleshooting

### Log del Bot
Il bot utilizza logging strutturato per il debug:
```python
logging.basicConfig(level=logging.INFO)
```

### Problemi Comuni
1. **Bot non risponde**: Verifica il token e i permessi
2. **Errore database**: Controlla i permessi di scrittura nella directory
3. **Errore OpenAI**: Verifica la chiave API e i crediti disponibili

## 📝 Struttura del Progetto

```
pedro/
├── bot.py              # Bot principale
├── database.py         # Gestione database
├── openai_helper.py    # Integrazione OpenAI
├── config.py           # Configurazione
├── requirements.txt    # Dipendenze Python
└── README.md          # Documentazione
```

## 🤝 Contribuire

1. Fai fork del progetto
2. Crea un branch per la tua feature
3. Committa le modifiche
4. Apri una Pull Request

## 📄 Licenza

Questo progetto è sotto licenza MIT. Vedi il file LICENSE per i dettagli.

## 🆘 Supporto

Per supporto o domande, apri una issue su GitHub o contatta gli sviluppatori. 