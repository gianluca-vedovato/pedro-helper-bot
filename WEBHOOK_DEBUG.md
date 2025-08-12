# Debug Webhook Telegram - Sondaggi non rilevati

## Problema Attuale
Il webhook riceve gli update dei sondaggi ma non invia mai risposte. Dai log vediamo:

1. **Sondaggio creato** (update 459461196) - viene gestito da `bot.on('poll')` ma non ha chat_id
2. **Sondaggio votato/chiuso** (update 459461197) - viene gestito da `bot.on('poll')` 
3. **Comando `/applica_sondaggio`** (update 459461198, 459461200) - viene ricevuto ma non processato

## Soluzioni Implementate

### 1. Handler Corretti
- **`bot.on('message')`**: Cattura messaggi con sondaggi e invia risposta
- **`bot.on('poll')`**: Solo aggiorna risultati esistenti (voti, chiusura)
- **`bot.hears(/\/applica_sondaggio(@\w+)?\s+(.+)/)`: Gestisce comando con @botname

### 2. Logging Esteso
- Aggiunto logging per tutti i passaggi
- Tracciamento comandi ricevuti
- Debug database e AI

## Debug Steps

### 1. Deploy Aggiornato
- Fai nuovo deploy su Netlify con il codice aggiornato

### 2. Test Sondaggio
- Crea un nuovo sondaggio
- Dovresti vedere nei log:
  ```
  Poll message detected: {...}
  Saving poll to database: {...}
  Sending poll response: ...
  Poll response sent successfully
  ```

### 3. Test Comando
- Usa `/applica_sondaggio <poll_id>` o `/applica_sondaggio@botname <poll_id>`
- Dovresti vedere:
  ```
  Applica sondaggio command received: ...
  Extracted poll_id: ...
  handleApplyPoll called with poll_id: ...
  ```

### 4. Verifica Database
- Controlla che il sondaggio sia salvato in Supabase
- Verifica che le regole siano caricate

## Struttura Update Telegram
```json
// Creazione sondaggio
{
  "update_id": 123,
  "message": {
    "chat": {"id": 789},
    "poll": {
      "id": "poll_123",
      "question": "Domanda?",
      "options": [{"text": "Opzione 1"}]
    }
  }
}

// Aggiornamento sondaggio
{
  "update_id": 124,
  "poll": {
    "id": "poll_123",
    "options": [{"text": "Opzione 1", "voter_count": 1}],
    "is_closed": true
  }
}
```

## Handler Registrati
- `bot.on('message')` - Cattura messaggi con sondaggi e invia risposta
- `bot.on('poll')` - Aggiorna risultati esistenti
- `bot.command('applica_sondaggio')` - Gestisce comando base
- `bot.hears(/\/applica_sondaggio(@\w+)?\s+(.+)/)` - Gestisce comando con @botname
- `bot.action(/apply:.+/)` - Gestisce pulsante "Applica sondaggio"

## Debug Steps
1. ✅ Verifica webhook con `npm run check-webhook`
2. ✅ Controlla log Netlify Functions
3. ✅ Testa comando `/start` (deve funzionare)
4. ✅ Crea sondaggio e controlla log per "Poll message detected"
5. ✅ Usa `/applica_sondaggio <poll_id>` e controlla log per "Applica sondaggio command received"
6. ✅ Verifica che `allowed_updates` includa `poll`
