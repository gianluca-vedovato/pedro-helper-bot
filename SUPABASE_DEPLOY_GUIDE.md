# 🚀 Deploy Bot Telegram con Supabase

Guida completa per deployare il bot su Render con database Supabase!

## 🎯 **COSA ABBIAMO INTEGRATO**

### **Database Supabase:**
- ✅ **PostgreSQL sempre attivo** (non va mai in sleep)
- ✅ **Dati persistenti** (non si perdono mai)
- ✅ **API REST integrate**
- ✅ **Dashboard web** per gestire i dati
- ✅ **Backup automatici**

### **Funzionalità:**
- ✅ **Regole fantacalcio** con numerazione automatica
- ✅ **Promemoria** per gruppo
- ✅ **Sondaggi** per approvare modifiche
- ✅ **Fallback automatico** a SQLite se Supabase non funziona

---

## 🚀 **SETUP SUPABASE**

### **Passo 1: Crea Account Supabase**
1. **Vai su [supabase.com](https://supabase.com)**
2. **Clicca "Start your project"**
3. **Registrati con GitHub**

### **Passo 2: Crea Nuovo Progetto**
1. **"New Project"**
2. **Nome**: `pedro-fantacalcio-bot`
3. **Database Password**: Scegli una password sicura
4. **Region**: Europa (Frankfurt o London)
5. **Clicca "Create new project"**

### **Passo 3: Aspetta il Setup**
- **Database**: 2-3 minuti
- **API**: Si attiva automaticamente

---

## 🔧 **CONFIGURAZIONE DATABASE**

### **Passo 4: Esegui Script SQL**
1. **Dashboard Supabase** → **"SQL Editor"**
2. **Copia e incolla** il contenuto di `supabase_setup.sql`
3. **Clicca "Run"**
4. **Verifica** che le tabelle siano create

### **Tabelle Create:**
- `rules` - Regole del fantacalcio
- `reminders` - Promemoria per gruppo
- `polls` - Sondaggi per approvare modifiche

---

## ⚙️ **CONFIGURAZIONE BOT SU RENDER**

### **Passo 5: Aggiungi Variabili d'Ambiente**
Nel tuo bot su Render, aggiungi:

```env
DATABASE_TYPE=supabase
SUPABASE_URL=https://tuo-progetto.supabase.co
SUPABASE_ANON_KEY=la_tua_chiave_anonima
```

### **Dove trovare le credenziali:**
1. **Dashboard Supabase** → **"Settings"** → **"API"**
2. **Project URL**: `https://tuo-progetto.supabase.co`
3. **anon public**: La chiave pubblica

---

## 🧪 **TEST DEL BOT**

### **Comandi da testare:**
1. **`/start`** - Avvia il bot
2. **`/help`** - Mostra tutti i comandi
3. **`/regolamento`** - Mostra le regole (dovrebbero essere 5)
4. **`/askpedro`** - Fai domande sui regolamenti
5. **`/promemoria`** - Testa i promemoria

### **Verifica Database:**
- **Dashboard Supabase** → **"Table Editor"**
- **Controlla** che le regole siano presenti
- **Verifica** che i promemoria si salvino

---

## 🔍 **MONITORAGGIO**

### **Supabase Dashboard:**
- ✅ **Stato database** (sempre attivo)
- ✅ **Tabelle e dati** in tempo reale
- ✅ **Log delle query** e performance
- ✅ **Uso dello storage** e bandwith

### **Render Dashboard:**
- ✅ **Stato del bot** (online/offline)
- ✅ **Log del bot** in tempo reale
- ✅ **Variabili d'ambiente** configurate

---

## 🚨 **TROUBLESHOOTING**

### **Se il bot non si connette a Supabase:**
1. **Verifica le credenziali** (URL e chiave)
2. **Controlla che le tabelle** siano create
3. **Verifica i log** su Render
4. **Il bot fallback** automaticamente a SQLite

### **Se i dati non si salvano:**
1. **Controlla le policy RLS** su Supabase
2. **Verifica i permessi** delle tabelle
3. **Controlla i log** per errori specifici

---

## 🎯 **VANTAGGI FINALI**

- ✅ **Database sempre attivo** (Supabase)
- ✅ **Dati persistenti** (non si perdono mai)
- ✅ **Bot funzionante** su Render
- ✅ **Fallback automatico** a SQLite
- ✅ **Completamente gratuito**
- ✅ **Scalabile** se cresce l'uso

---

## 🚀 **PROSSIMO PASSO**

**Dopo aver configurato Supabase:**
1. **Riavvia il bot** su Render
2. **Testa i comandi** principali
3. **Verifica** che i dati si salvino
4. **Il tuo bot è pronto!** 🎉

---

## 🎉 **RISULTATO FINALE**

Dopo il deploy:
- **Il tuo bot è online** su Render ✅
- **Database sempre attivo** su Supabase ✅
- **Dati persistenti** e sicuri ✅
- **Completamente gratuito** e affidabile! 🚀

**Hai domande su qualche passaggio? Ti aiuto con tutto!** 🎯
