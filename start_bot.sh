#!/bin/bash

# Script per avviare il bot Pedro
# Assicurati di aver configurato il file .env con i tuoi token

echo "🚀 Avvio Bot Pedro..."
echo "======================"

# Verifica se esiste il file .env
if [ ! -f .env ]; then
    echo "❌ File .env non trovato!"
    echo "📝 Crea il file .env con le tue credenziali:"
    echo "   cp env_example.txt .env"
    echo "   # Poi modifica .env con i tuoi token"
    exit 1
fi

# Verifica se esiste l'ambiente virtuale
if [ ! -d "venv" ]; then
    echo "🔧 Creazione ambiente virtuale..."
    python3 -m venv venv
fi

# Attiva l'ambiente virtuale
echo "🔌 Attivazione ambiente virtuale..."
source venv/bin/activate

# Installa dipendenze se necessario
echo "📦 Verifica dipendenze..."
pip install -r requirements.txt > /dev/null 2>&1

# Avvia il bot
echo "🤖 Avvio bot..."
echo "💡 Premi Ctrl+C per fermare il bot"
echo ""

python bot.py 