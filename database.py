import sqlite3
import json
from datetime import datetime
from config import DATABASE_PATH

class Database:
    def __init__(self):
        self.db_path = DATABASE_PATH
        self.init_database()
    
    def init_database(self):
        """Initialize the database with required tables"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Drop and recreate polls table to ensure correct schema
        cursor.execute('DROP TABLE IF EXISTS polls')
        
        # Create rules table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_number INTEGER UNIQUE NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create polls table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS polls (
                poll_id TEXT PRIMARY KEY,
                chat_id INTEGER NOT NULL,
                message_id INTEGER NOT NULL,
                creator_user_id INTEGER,
                rule_number INTEGER,
                action TEXT, -- 'approve' (add/update) | 'remove'
                proposed_content TEXT,
                question TEXT,
                options_json TEXT,
                is_closed INTEGER DEFAULT 0,
                results_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Create reminders table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS reminders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                user_name TEXT,
                text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        conn.commit()
        conn.close()
    
    def add_rule(self, rule_number, content):
        """Add a new rule or update existing one"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute('''
                INSERT OR REPLACE INTO rules (rule_number, content, updated_at)
                VALUES (?, ?, ?)
            ''', (rule_number, content, datetime.now()))
            
            conn.commit()
            return True
        except Exception as e:
            print(f"Error adding rule: {e}")
            return False
        finally:
            conn.close()
    
    def get_rule(self, rule_number):
        """Get a specific rule by number"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT content FROM rules WHERE rule_number = ?', (rule_number,))
        result = cursor.fetchone()
        
        conn.close()
        return result[0] if result else None
    
    def get_all_rules(self):
        """Get all rules ordered by rule number"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute('SELECT rule_number, content FROM rules ORDER BY rule_number')
        rules = cursor.fetchall()
        
        conn.close()
        return rules
    
    def delete_rule(self, rule_number):
        """Delete a specific rule"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute('DELETE FROM rules WHERE rule_number = ?', (rule_number,))
            conn.commit()
            return True
        except Exception as e:
            print(f"Error deleting rule: {e}")
            return False
        finally:
            conn.close()

    def get_next_rule_number(self):
        """Get the next available rule number (max + 1, starting from 1)."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('SELECT COALESCE(MAX(rule_number), 0) + 1 FROM rules')
            next_num = cursor.fetchone()[0]
            return int(next_num)
        finally:
            conn.close()

    def rule_exists(self, rule_number):
        """Return True if the rule exists."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('SELECT 1 FROM rules WHERE rule_number = ? LIMIT 1', (rule_number,))
            return cursor.fetchone() is not None
        finally:
            conn.close()

    def save_poll(self, poll_id, chat_id, message_id, creator_user_id, rule_number, action, proposed_content, question=None, options_json=None):
        """Insert or update a poll metadata record."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO polls (poll_id, chat_id, message_id, creator_user_id, rule_number, action, proposed_content, question, options_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(poll_id) DO UPDATE SET
                    chat_id=excluded.chat_id,
                    message_id=excluded.message_id,
                    creator_user_id=excluded.creator_user_id,
                    rule_number=excluded.rule_number,
                    action=excluded.action,
                    proposed_content=excluded.proposed_content,
                    question=excluded.question,
                    options_json=excluded.options_json,
                    updated_at=CURRENT_TIMESTAMP
            ''', (poll_id, chat_id, message_id, creator_user_id, rule_number, action, proposed_content, question, options_json))
            conn.commit()
        except Exception as e:
            print(f"Error saving poll: {e}")
            raise
        finally:
            conn.close()

    def update_poll_results(self, poll_id, is_closed, results_json):
        """Update a poll record with the latest results and closed flag."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute('''
                UPDATE polls
                SET is_closed = ?, results_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE poll_id = ?
            ''', (1 if is_closed else 0, results_json, poll_id))
            conn.commit()
        except Exception as e:
            print(f"Error updating poll results: {e}")
            raise
        finally:
            conn.close()

    def get_poll(self, poll_id):
        """Return a poll record dict or None."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        try:
            cursor.execute('SELECT * FROM polls WHERE poll_id = ?', (poll_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    # -----------------
    # Reminders (Promemoria)
    # -----------------

    def add_reminder(self, chat_id: int, user_id: int, user_name: str, text: str):
        """Insert a new reminder and return its id (or None on error)."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            cursor.execute(
                'INSERT INTO reminders (chat_id, user_id, user_name, text) VALUES (?, ?, ?, ?)',
                (chat_id, user_id, user_name, text)
            )
            conn.commit()
            return cursor.lastrowid
        except Exception as e:
            print(f"Error adding reminder: {e}")
            return None
        finally:
            conn.close()

    def list_reminders(self, chat_id: int):
        """Return list of reminder dicts for the given chat."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        try:
            cursor.execute(
                'SELECT id, chat_id, user_id, user_name, text, created_at FROM reminders WHERE chat_id = ? ORDER BY id DESC',
                (chat_id,)
            )
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
        except Exception as e:
            print(f"Error listing reminders: {e}")
            return []
        finally:
            conn.close()

    def delete_reminder(self, chat_id: int, reminder_id: int, requester_user_id: int, is_admin: bool = False) -> bool:
        """Delete a reminder by id within a chat. Only admins or the author can delete.
        Returns True if a row was deleted.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            if is_admin:
                cursor.execute(
                    'DELETE FROM reminders WHERE id = ? AND chat_id = ?',
                    (reminder_id, chat_id)
                )
            else:
                cursor.execute(
                    'DELETE FROM reminders WHERE id = ? AND chat_id = ? AND user_id = ?',
                    (reminder_id, chat_id, requester_user_id)
                )
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            print(f"Error deleting reminder: {e}")
            return False
        finally:
            conn.close()
    
    def get_database_info(self):
        """Get database statistics and information"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # Get table info
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = cursor.fetchall()
            
            info = {
                'tables': [table[0] for table in tables],
                'rules_count': 0
            }
            
            # Count rules
            cursor.execute('SELECT COUNT(*) FROM rules')
            info['rules_count'] = cursor.fetchone()[0]
            
            return info
            
        except Exception as e:
            print(f"Error getting database info: {e}")
            return None
        finally:
            conn.close() 