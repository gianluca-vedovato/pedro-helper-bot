# 🚀 Guida al Deploy di Pedro

Questa guida ti aiuterà a deployare il bot Pedro in produzione.

## 📋 Prerequisiti

- Server Linux (Ubuntu 20.04+ consigliato)
- Python 3.8+
- Accesso SSH al server
- Token bot Telegram
- Chiave API OpenAI

## 🔧 Setup del Server

### 1. Aggiorna il sistema
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Installa Python e dipendenze
```bash
sudo apt install python3 python3-pip python3-venv git screen -y
```

### 3. Crea utente per il bot
```bash
sudo adduser pedro
sudo usermod -aG sudo pedro
sudo su - pedro
```

## 📥 Deploy del Codice

### 1. Clona il repository
```bash
cd /home/pedro
git clone <repository-url> pedro-bot
cd pedro-bot
```

### 2. Crea ambiente virtuale
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Configura le variabili d'ambiente
```bash
cp env_example.txt .env
nano .env
```

Compila il file `.env`:
```env
BOT_TOKEN=your_telegram_bot_token_here
OPENAI_API_KEY=your_openai_api_key_here
DATABASE_PATH=/home/pedro/pedro-bot/fantacalcio_bot.db
```

## 🚀 Avvio del Bot

### Opzione 1: Screen (Semplice)
```bash
# Avvia il bot in background
screen -S pedro-bot
source venv/bin/activate
python bot.py

# Esci da screen: Ctrl+A, poi D
# Riconnetti: screen -r pedro-bot
```

### Opzione 2: Systemd Service (Raccomandato)

Crea il file di servizio:
```bash
sudo nano /etc/systemd/system/pedro-bot.service
```

Contenuto:
```ini
[Unit]
Description=Pedro Telegram Bot
After=network.target

[Service]
Type=simple
User=pedro
WorkingDirectory=/home/pedro/pedro-bot
Environment=PATH=/home/pedro/pedro-bot/venv/bin
ExecStart=/home/pedro/pedro-bot/venv/bin/python bot.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Attiva il servizio:
```bash
sudo systemctl daemon-reload
sudo systemctl enable pedro-bot
sudo systemctl start pedro-bot
sudo systemctl status pedro-bot
```

## 📊 Monitoraggio

### Log del servizio
```bash
# Visualizza log in tempo reale
sudo journalctl -u pedro-bot -f

# Log degli ultimi 100 messaggi
sudo journalctl -u pedro-bot -n 100
```

### Stato del servizio
```bash
sudo systemctl status pedro-bot
```

### Riavvio del servizio
```bash
sudo systemctl restart pedro-bot
```

## 🔒 Sicurezza

### 1. Firewall
```bash
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 2. Permessi file
```bash
chmod 600 .env
chown pedro:pedro .env
```

### 3. Backup automatico
Crea script di backup:
```bash
nano backup.sh
```

```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp fantacalcio_bot.db "backup_${DATE}.db"
find . -name "backup_*.db" -mtime +7 -delete
```

Rendi eseguibile e aggiungi a cron:
```bash
chmod +x backup.sh
crontab -e
# Aggiungi: 0 2 * * * /home/pedro/pedro-bot/backup.sh
```

## 🐛 Troubleshooting

### Bot non risponde
```bash
# Verifica stato servizio
sudo systemctl status pedro-bot

# Controlla log
sudo journalctl -u pedro-bot -f

# Verifica token
grep BOT_TOKEN .env
```

### Errori database
```bash
# Verifica permessi
ls -la fantacalcio_bot.db

# Test database
source venv/bin/activate
python test_sondaggi.py
```

### Problemi OpenAI
```bash
# Verifica chiave API
grep OPENAI_API_KEY .env

# Test connessione
source venv/bin/activate
python -c "from openai import OpenAI; client = OpenAI(); print('OK')"
```

## 📈 Scaling

### Monitoraggio risorse
```bash
# Installa htop
sudo apt install htop

# Monitora risorse
htop
```

### Log rotation
```bash
sudo nano /etc/logrotate.d/pedro-bot
```

```
/home/pedro/pedro-bot/*.log {
    daily
    missingok
    rotate 7
    compress
    notifempty
    create 644 pedro pedro
}
```

## 🔄 Aggiornamenti

### 1. Backup prima dell'aggiornamento
```bash
./backup.sh
```

### 2. Pull nuovo codice
```bash
git pull origin main
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Riavvio servizio
```bash
sudo systemctl restart pedro-bot
```

## 📞 Supporto

In caso di problemi:
1. Controlla i log: `sudo journalctl -u pedro-bot -f`
2. Verifica stato servizio: `sudo systemctl status pedro-bot`
3. Testa database: `python test_sondaggi.py`
4. Controlla configurazione: `cat .env`

---

**Pedro** - Deploy in produzione completato! 🎉 