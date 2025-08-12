import os
from dotenv import load_dotenv

load_dotenv()

# Bot configuration
BOT_TOKEN = os.getenv('BOT_TOKEN')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

# Database configuration
DATABASE_TYPE = os.getenv('DATABASE_TYPE', 'sqlite')  # 'supabase' or 'sqlite'
DATABASE_PATH = 'fantacalcio_bot.db'  # Fallback for SQLite

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY')

# OpenAI configuration
OPENAI_MODEL = 'gpt-3.5-turbo'
MAX_TOKENS = 500 