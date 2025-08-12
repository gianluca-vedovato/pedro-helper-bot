import os
from dotenv import load_dotenv

load_dotenv()

# Bot configuration
BOT_TOKEN = os.getenv('BOT_TOKEN')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

# Database configuration
DATABASE_PATH = 'fantacalcio_bot.db'

# OpenAI configuration
OPENAI_MODEL = 'gpt-3.5-turbo'
MAX_TOKENS = 500 