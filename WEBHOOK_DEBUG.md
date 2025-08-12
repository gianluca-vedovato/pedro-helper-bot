# Debug Webhook Telegram - Sondaggi non rilevati

## Problema
Il bot non risponde quando crei un sondaggio. Questo può essere dovuto a:

1. **Webhook non configurato correttamente**
2. **Tipi di update non abilitati**
3. **Handler non registrato per i sondaggi**

## Soluzioni

### 1. Verifica Webhook
```bash
# Sostituisci con i tuoi valori
npm run check-webhook <BOT_TOKEN> <WEBHOOK_URL>

# Esempio:
npm run check-webhook 123456:ABC-DEF https://site.netlify.app/.netlify/functions/telegram-webhook
```

### 2. Configurazione Manuale Webhook
```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d url="https://<site>.netlify.app/.netlify/functions/telegram-webhook" \
  -d allowed_updates='["message","poll","callback_query","poll_answer"]'
```

### 3. Verifica Log Netlify
- Vai su Netlify Dashboard > Functions > telegram-webhook
- Controlla i log per vedere se arrivano update
- Dovresti vedere:
  ```
  Webhook received: {"update_id":123,"message":{...}}
  Parsed update: {"update_id":123,"message":{...}}
  ```

### 4. Test Locale
```bash
npm start
# In un altro terminale:
curl -X POST http://localhost:8787 \
  -H 'content-type: application/json' \
  -d '{"update_id":1,"message":{"message_id":1,"chat":{"id":123},"text":"/start"}}'
```

### 5. Verifica Permessi Bot
Il bot deve avere permessi per:
- Leggere messaggi
- Inviare messaggi
- Gestire sondaggi

## Struttura Update Telegram
```json
{
  "update_id": 123,
  "message": {
    "message_id": 456,
    "chat": {"id": 789},
    "poll": {
      "id": "poll_123",
      "question": "Domanda?",
      "options": [{"text": "Opzione 1"}, {"text": "Opzione 2"}]
    }
  }
}
```

## Handler Registrati
- `bot.on('message')` - Cattura tutti i messaggi (inclusi sondaggi)
- `bot.on('poll')` - Cattura aggiornamenti sondaggi
- `bot.action(/apply:.+/)` - Gestisce pulsante "Applica sondaggio"

## Debug Steps
1. ✅ Verifica webhook con `npm run check-webhook`
2. ✅ Controlla log Netlify Functions
3. ✅ Testa comando `/start` (deve funzionare)
4. ✅ Crea sondaggio e controlla log
5. ✅ Verifica che `allowed_updates` includa `poll`
