#!/bin/bash

echo "🚀 Setup Pedro Bot - Sistema Sondaggi e Regole"
echo "================================================"

# Verifica Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 non trovato. Installa Python 3.8+ prima di continuare."
    exit 1
fi

echo "✅ Python3 trovato: $(python3 --version)"

# Crea ambiente virtuale
if [ ! -d "venv" ]; then
    echo "📦 Creazione ambiente virtuale..."
    python3 -m venv venv
    echo "✅ Ambiente virtuale creato"
else
    echo "✅ Ambiente virtuale già esistente"
fi

# Attiva ambiente virtuale
echo "🔧 Attivazione ambiente virtuale..."
source venv/bin/activate

# Aggiorna pip
echo "📦 Aggiornamento pip..."
pip install --upgrade pip

# Installa dipendenze
echo "📦 Installazione dipendenze..."
pip install -r requirements.txt

# Verifica installazione
echo "🧪 Verifica installazione..."
python test_sondaggi.py

echo ""
echo "🎉 Setup completato con successo!"
echo ""
echo "📋 Prossimi passi:"
echo "1. Crea un file .env con i tuoi token:"
echo "   cp .env.example .env"
echo "   # Modifica .env con BOT_TOKEN e OPENAI_API_KEY"
echo ""
echo "2. Avvia il bot:"
echo "   source venv/bin/activate"
echo "   python bot.py"
echo ""
echo "3. Testa le funzionalità:"
echo "   python test_bot_simple.py"
echo ""
echo "📚 Per maggiori informazioni, leggi README_SONDAGGI.md" 