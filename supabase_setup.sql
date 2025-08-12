-- Script per configurare le tabelle su Supabase
-- Esegui questo script nel SQL Editor di Supabase

-- Tabella per le regole
CREATE TABLE IF NOT EXISTS rules (
    id SERIAL PRIMARY KEY,
    rule_number INTEGER UNIQUE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella per i promemoria
CREATE TABLE IF NOT EXISTS reminders (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    user_name TEXT,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabella per i sondaggi
CREATE TABLE IF NOT EXISTS polls (
    poll_id TEXT PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    message_id BIGINT NOT NULL,
    creator_user_id BIGINT,
    rule_number INTEGER,
    action TEXT, -- 'approve' (add/update) | 'remove'
    proposed_content TEXT,
    question TEXT,
    options_json TEXT,
    is_closed INTEGER DEFAULT 0,
    results_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Inserisci alcune regole di esempio
INSERT INTO rules (rule_number, content) VALUES 
(1, 'Il fantacalcio si gioca con 11 giocatori titolari'),
(2, 'Le sostituzioni sono illimitate durante la partita'),
(3, 'I punti si calcolano secondo la tabella ufficiale'),
(4, 'Il capitano ha diritto a raddoppiare i punti'),
(5, 'Le riserve sono 4 giocatori');

-- Crea indici per migliorare le performance
CREATE INDEX IF NOT EXISTS idx_rules_rule_number ON rules(rule_number);
CREATE INDEX IF NOT EXISTS idx_reminders_chat_id ON reminders(chat_id);
CREATE INDEX IF NOT EXISTS idx_polls_poll_id ON polls(poll_id);

-- Abilita Row Level Security (RLS) per sicurezza
ALTER TABLE rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;

-- Crea policy per permettere tutte le operazioni (per ora)
CREATE POLICY "Allow all operations on rules" ON rules FOR ALL USING (true);
CREATE POLICY "Allow all operations on reminders" ON reminders FOR ALL USING (true);
CREATE POLICY "Allow all operations on polls" ON polls FOR ALL USING (true);
