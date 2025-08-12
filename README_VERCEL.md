# 🚀 Deploy Bot Telegram su Render + Vercel Cron

Questa guida ti spiega come deployare il bot su Render e mantenerlo sempre sveglio con Vercel!

## 📋 **COSA ABBIAMO CREATO**

### **File Aggiunti:**
- `vercel.json` - Configurazione cron job
- `api/keep-alive.js` - Funzione che mantiene sveglio il bot
- `api/status.js` - Funzione per controllare lo stato del bot

## 🎯 **COME FUNZIONA**

1. **Vercel esegue automaticamente** `/api/keep-alive` ogni 10 minuti
2. **La funzione chiama il tuo bot** su Render
3. **Render "sveglia" il bot** e rimane attivo per 15 minuti
4. **Ripete ogni 10 minuti** = bot sempre sveglio! 🎉

---

## 🚀 **DEPLOY SU RENDER (BOT)**

### **Passo 1: Crea Account Render**
1. Vai su [render.com](https://render.com)
2. **Registrati con GitHub**
3. **Clicca "New"** → **"Web Service"**

### **Passo 2: Connetti Repository**
1. **Seleziona il tuo repository** `pedro`
2. **Branch**: `main`

### **Passo 3: Configurazione**
- **Name**: `pedro-fantacalcio-bot`
- **Environment**: `Python 3`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `python bot.py`

### **Passo 4: Variabili d'Ambiente**
```env
BOT_TOKEN=il_tuo_token_bot
OPENAI_API_KEY=la_tua_api_key_openai
DATABASE_PATH=fantacalcio_bot.db
OPENAI_MODEL=gpt-3.5-turbo
MAX_TOKENS=500
```

### **Passo 5: Deploy**
1. **Clicca "Create Web Service"**
2. **Aspetta il build** (5-10 minuti)
3. **Copia l'URL** del bot (es: `https://pedro-bot.onrender.com`)

---

## ⚡ **DEPLOY SU VERCEL (CRON JOB)**

### **Passo 1: Crea Account Vercel**
1. Vai su [vercel.com](https://vercel.com)
2. **Registrati con GitHub**
3. **Importa il tuo repository** `pedro`

### **Passo 2: Configura Variabili d'Ambiente**
Nel dashboard Vercel, vai su **"Settings"** → **"Environment Variables"**:

```env
BOT_URL=https://tuo-bot-su-render.onrender.com
```

**IMPORTANTE**: Sostituisci con l'URL reale del tuo bot su Render!

### **Passo 3: Deploy Automatico**
1. **Vercel rileverà automaticamente** i file
2. **Il cron job si attiverà** automaticamente
3. **Ogni 10 minuti** il bot sarà mantenuto sveglio

---

## 🔧 **VERIFICA FUNZIONAMENTO**

### **Test Manuale:**
1. **Vai su**: `https://tuo-progetto.vercel.app/api/status`
2. **Dovresti vedere**: Status del bot e tempo di risposta

### **Log Vercel:**
1. **Dashboard Vercel** → **"Functions"**
2. **Clicca su** `keep-alive` o `status`
3. **Vedi i log** in tempo reale

### **Log Render:**
1. **Dashboard Render** → **"Logs"**
2. **Vedi quando il bot** viene "svegliato"

---

## 📊 **MONITORAGGIO**

### **Vercel Dashboard:**
- ✅ **Cron job eseguiti** ogni 10 minuti
- ✅ **Log delle funzioni** in tempo reale
- ✅ **Performance** e errori

### **Render Dashboard:**
- ✅ **Stato del bot** (online/offline)
- ✅ **Log del bot** in tempo reale
- ✅ **Uso delle ore** gratuite

---

## 🎯 **VANTAGGI DI QUESTA SOLUZIONE**

- ✅ **Bot sempre sveglio** (no sleep)
- ✅ **Completamente gratuito**
- ✅ **Setup automatico** del cron
- ✅ **Monitoraggio completo**
- ✅ **Scalabile** se cresce l'uso

---

## 🚨 **TROUBLESHOOTING**

### **Se il cron non funziona:**
1. **Verifica la variabile** `BOT_URL` su Vercel
2. **Controlla i log** su Vercel Functions
3. **Verifica che il bot** sia online su Render

### **Se il bot va offline:**
1. **Controlla i log** su Render
2. **Verifica le variabili** d'ambiente
3. **Controlla che il database** si crei correttamente

---

## 🎉 **RISULTATO FINALE**

Dopo il deploy:
- **Il tuo bot è online** su Render
- **Vercel lo mantiene sveglio** ogni 10 minuti
- **Risponde istantaneamente** ai messaggi
- **Completamente gratuito** e affidabile!

---

## 🚀 **PROSSIMO PASSO**

1. **Deploya prima su Render** (bot)
2. **Poi su Vercel** (cron job)
3. **Testa il bot** su Telegram
4. **Verifica che rimanga sveglio**!

Hai domande su qualche passaggio? Ti aiuto con tutto! 🎯
