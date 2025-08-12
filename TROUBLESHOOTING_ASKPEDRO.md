# Troubleshooting: Comando `/askpedro` non funziona

## Problema
Il comando `/askpedro` restituisce "Errore AI, riprova più tardi."

## Cause Possibili

### 1. **Problema di Inizializzazione Client**
- I client OpenAI e Supabase non vengono inizializzati correttamente
- Le variabili d'ambiente non sono configurate

### 2. **Problema Database**
- Connessione a Supabase fallita
- Tabella `rules` vuota o non accessibile
- Problemi di permessi

### 3. **Problema OpenAI API**
- Chiave API non valida o scaduta
- Limiti di quota raggiunti
- Problemi di rete

## Soluzioni Implementate

### ✅ **Fix Strutturale**
- Corretta la funzione `ensureClients()` per inizializzare correttamente i client
- Aggiunto logging dettagliato per debug
- Migliorata gestione degli errori

### ✅ **Logging Migliorato**
- Log dettagliati per ogni fase del processo
- Tracciamento completo degli errori
- Validazione delle variabili d'ambiente

### ✅ **Gestione Errori Robusta**
- Try-catch appropriati in tutte le funzioni critiche
- Messaggi di errore informativi
- Fallback graceful per errori non critici

## Test di Verifica

### 1. **Test Database**
```bash
node test_db_connection.js
```

### 2. **Controllo Log Netlify**
- Vai su Netlify Dashboard > Functions > telegram-webhook
- Controlla i log per errori specifici

### 3. **Verifica Variabili Ambiente**
Assicurati che siano configurate in Netlify:
- `BOT_TOKEN`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Debug Steps

### 1. **Controlla i Log**
I log ora mostrano:
- Inizializzazione client
- Connessione database
- Chiamate OpenAI
- Errori dettagliati

### 2. **Verifica Database**
- Controlla che la tabella `rules` contenga dati
- Verifica i permessi Supabase
- Testa la connessione manualmente

### 3. **Test OpenAI**
- Verifica la validità della chiave API
- Controlla i crediti disponibili
- Testa la connessione manualmente

## Comandi di Test

### Test Locale
```bash
# Installa dipendenze
npm install

# Test connessioni
node test_db_connection.js

# Test webhook locale
npm start
```

### Test Webhook
```bash
curl -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -d url="https://<site>.netlify.app/.netlify/functions/telegram-webhook"
```

## Monitoraggio

### Log da Controllare
1. **ensureClients**: Inizializzazione client
2. **getAllRules**: Connessione database
3. **askAboutRules**: Chiamate OpenAI
4. **askpedro command**: Gestione comando

### Metriche da Monitorare
- Tempo di risposta OpenAI
- Successo connessioni database
- Errori per tipo
- Utilizzo quota API

## Contatto Supporto

Se il problema persiste:
1. Controlla i log Netlify
2. Esegui i test di connessione
3. Verifica le variabili d'ambiente
4. Controlla lo stato dei servizi (OpenAI, Supabase)

## Status Aggiornamento

**Data**: 12/08/2025
**Problema**: Comando `/askpedro` non funziona
**Soluzione**: Fix strutturale e logging migliorato
**Status**: ✅ Implementato
**Test**: In attesa di verifica
