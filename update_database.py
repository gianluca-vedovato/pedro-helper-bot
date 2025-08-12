#!/usr/bin/env python3
"""
Script per aggiornare il database esistente
"""

import sqlite3
import os
from config import DATABASE_PATH

def update_database():
    """Aggiorna il database esistente"""
    print("🔄 Aggiornamento database...")
    
    # Verifica se il database esiste
    if not os.path.exists(DATABASE_PATH):
        print(f"❌ Database {DATABASE_PATH} non trovato")
        return False
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Verifica struttura attuale tabella rules
        cursor.execute("PRAGMA table_info(rules)")
        columns = cursor.fetchall()
        column_names = [col[1] for col in columns]
        
        print(f"📋 Struttura attuale tabella rules: {column_names}")
        
        # Aggiungi colonne mancanti se necessario
        if 'updated_at' not in column_names:
            print("➕ Aggiungendo colonna updated_at...")
            cursor.execute("ALTER TABLE rules ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        
        conn.commit()
        print("✅ Database aggiornato con successo!")
        
        # Verifica struttura finale
        cursor.execute("PRAGMA table_info(rules)")
        final_columns = cursor.fetchall()
        final_column_names = [col[1] for col in final_columns]
        print(f"📋 Struttura finale tabella rules: {final_column_names}")
        
        return True
        
    except Exception as e:
        print(f"❌ Errore nell'aggiornamento: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()

def backup_database():
    """Crea un backup del database prima dell'aggiornamento"""
    if os.path.exists(DATABASE_PATH):
        backup_path = f"{DATABASE_PATH}.backup"
        print(f"💾 Creando backup: {backup_path}")
        os.system(f"cp {DATABASE_PATH} {backup_path}")
        return backup_path
    return None

if __name__ == "__main__":
    print("🚀 Aggiornamento Database Pedro")
    print("=" * 40)
    
    # Crea backup
    backup_file = backup_database()
    if backup_file:
        print(f"✅ Backup creato: {backup_file}")
    
    # Aggiorna database
    if update_database():
        print("\n🎉 Database aggiornato con successo!")
        print("Ora puoi eseguire i test senza problemi.")
    else:
        print("\n❌ Errore nell'aggiornamento del database")
        if backup_file:
            print(f"Puoi ripristinare il backup: mv {backup_file} {DATABASE_PATH}") 