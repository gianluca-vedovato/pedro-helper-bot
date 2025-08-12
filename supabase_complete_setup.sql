-- Script COMPLETO per Supabase: crea tabelle + popola regole
-- Esegui questo script nel SQL Editor di Supabase

-- ========================================
-- PARTE 1: CREAZIONE TABELLE
-- ========================================

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

-- ========================================
-- PARTE 2: POPOLAMENTO REGOLE
-- ========================================

-- Prima pulisci le tabelle esistenti (opzionale)
DELETE FROM rules;

-- Reset della sequenza ID
ALTER SEQUENCE rules_id_seq RESTART WITH 1;

-- Inserisci tutte le regole del fantacalcio
INSERT INTO rules (rule_number, content) VALUES 
(1, 'Budget Disponibile: Ogni partecipante al fantacalcio avrà a disposizione un budget di 500 fantamilioni per la composizione della propria squadra.'),

(2, 'Modalità dell''Asta: L''asta si terrà venerdì 30 settembre 2024 alle ore 22:00. L''ordine di chiamata dei giocatori sarà determinato tramite sorteggio. L''asta sarà di tipo a chiamata con un prezzo base per ciascun giocatore fissato a 1 fantamilione. La rosa di ogni squadra dovrà essere composta da: Un pacchetto di portieri, 8 difensori, 8 centrocampisti, 6 attaccanti.'),

(3, 'Acquisto dei Portieri: L''acquisto dei portieri avverrà per pacchetto, ovvero sarà possibile acquistare l''intero pacchetto dei portieri di una squadra. In caso di trasferimento di un portiere a un''altra squadra, il pacchetto resterà invariato senza possibilità di conguaglio economico.'),

(4, 'Superamento del Budget: Nel caso in cui un partecipante superi il budget assegnato, verrà applicata una penalizzazione di 3 punti in classifica per ogni milione eccedente, fino a un massimo di 15 milioni.'),

(5, 'Comportamento durante l''Asta: Durante l''asta, è obbligatorio limitarsi a parlare unicamente per proporre la propria offerta. Qualsiasi cifra pronunciata ad alta voce, anche in tono scherzoso, sarà considerata un''offerta ufficiale.'),

(6, 'Sistema di Punteggio: Goal: +3 punti, Assist: +1 punto, Rigore parato: +3 punti, Porta inviolata: +0,5 punti, Autogoal: -2 punti, Rigore sbagliato: -2 punti, Ammonizione: -0,5 punti, Espulsione: -1 punto. A partire da 66 punti complessivi, verrà assegnato 1 goal per ogni 3 punti.'),

(7, 'Capitano e Vice-Capitano: Al termine dell''asta, ogni partecipante dovrà nominare un capitano e un vice-capitano che rimarranno tali per l''intera stagione. Il capitano riceverà un bonus di +1 punto in caso di voto superiore a 7 e un malus di -1 punto in caso di voto inferiore a 5. Il vice-capitano assumerà il ruolo di capitano solo in caso di assenza o mancato voto del capitano. Il capitano potrà essere venduto o scambiato durante il mercato di gennaio. Il valore massimo per l''acquisto del capitano è di 15 fantamilioni.'),

(8, 'Mancato Inserimento della Formazione: In caso di mancato inserimento della formazione entro i termini stabiliti, verrà applicata una penalizzazione di 1 punto per ciascun mancato inserimento. A partire dal secondo mancato inserimento, il partecipante dovrà versare 5 euro per ogni ulteriore dimenticanza. Se l''omissione avviene nelle ultime 5 giornate di campionato, la sanzione sarà di 10 euro per ogni mancato inserimento. In coppa, sarà applicata una penalizzazione di 3 punti al punteggio totale di giornata.'),

(9, 'Mercato di Riparazione: Il mercato di riparazione si svolgerà secondo le seguenti modalità: Mercato di Settembre: Durante il mercato di settembre, sarà consentito vendere un massimo di 1 giocatore per ruolo, ad eccezione dei giocatori che non militano più in Serie A, i quali potranno essere venduti senza alcuna limitazione. Mercato di Gennaio: Durante il mercato di gennaio, gli scambi saranno illimitati, senza alcuna restrizione sul numero di vendite, acquisti o scambi tra squadre.'),

(10, 'Scambi Illimitati: Durante l''intero corso del campionato, sarà possibile effettuare scambi tra le squadre, anche con eventuali conguagli in fantamilioni. Tuttavia, al fine di evitare scambi brevi finalizzati a coprire esigenze temporanee, non sarà consentito scambiare lo stesso giocatore più volte entro 5 partite.'),

(11, 'Valutazione dei Giocatori durante i Mercati: Durante le finestre di mercato, i giocatori potranno essere ceduti al prezzo corrispondente alla media aritmetica tra il valore attuale di mercato e il prezzo di acquisto originario. Tale valore attuale è definito come la quotazione ufficiale del giocatore al momento della vendita, come riportato su fantacalcio.it.'),

(12, 'Rinvio di Partite: In caso di rinvio di una partita, se la partita verrà giocata entro l''inizio della successiva giornata, si attenderà il risultato della stessa. Altrimenti, verrà assegnato il 6 politico a tutti i componenti della rosa, riserve, infortunati e squalificati inclusi. Se si utilizzano i modificatori, il 6 sarà considerato come voto normale a tutti gli effetti.'),

(13, 'Quota di Partecipazione: Per partecipare al fantacalcio 2024/2025, ogni giocatore dovrà versare una quota di 50 euro. In caso di mancato pagamento prima dell''inizio dell''asta, il partecipante avrà a disposizione solo 450 crediti anziché 500. Sarà applicata una penalizzazione di 1 punto in classifica per ogni settimana di ritardo nel versamento. Il pagamento dovrà essere effettuato prima dell''inizio dell''asta al tesoriere designato, Federico Bruno.'),

(14, 'Montepremi: La distribuzione del montepremi sarà la seguente: Campionato: 1° classificato: 220 euro, 2° classificato: 110 euro, 3° classificato: 50 euro, miglior punteggio: 50 euro; Coppa: 1° classificato: 120 euro, 2° classificato: 50 euro. Le somme accumulate per i mancati inserimenti della formazione saranno suddivise equamente tra il vincitore del campionato e il miglior punteggio.'),

(15, 'Penalità per gli Ultimi Classificati: I partecipanti che alla fine del campionato occuperanno l''11ª e la 12ª posizione in classifica, dovranno versare una somma al fondo cassa da destinare all''acquisto di prodotti alcolici per l''asta successiva. In caso di mancata presentazione con doni alcolici/cibarie all''asta successiva, verranno sottratti 50 milioni dal budget iniziale.'),

(16, 'Termine Inserimento Formazione: La formazione dovrà essere inserita entro e non oltre 5 minuti prima dell''inizio della prima partita di giornata.'),

(17, 'Autogol Automatico: In caso una squadra realizzi un punteggio inferiore a 50 punti, verrà automaticamente assegnato un autogol.'),

(18, 'Modificatore Difesa: Se vengono schierati almeno 4 difensori in campo, e la media voto dei 3 migliori difensori più il portiere rientra nei seguenti scaglioni, si applicheranno i seguenti bonus: Media voto compresa tra 6 e 6,5: +1 punto, Media voto compresa tra 6,5 e 7: +2 punti, Media voto superiore a 7: +3 punti.'),

(19, 'Sostituzioni: Il numero massimo di sostituzioni consentito durante una partita è di 5 giocatori.'),

(20, 'Decreto Fede: Durante i mercati di settembre e gennaio, è vietato riacquistare il giocatore appena venduto al primo turno di buste. Sarà possibile fare offerte per lo stesso giocatore solo a partire dal secondo turno.'),

(21, 'Sospensione del Campionato: La sospensione del campionato sarà possibile solo con il consenso di almeno 9 partecipanti favorevoli.'),

(22, 'Positività al Covid: Se un partecipante ha almeno il 50% dei giocatori di un ruolo positivi al Covid, potrà comunque schierarli. Il voto di questi giocatori sarà determinato in base alla loro fantamedia. Se la fantamedia è pari o superiore a 6, il giocatore riceverà 6 come voto; altrimenti, si utilizzerà la fantamedia arrotondata per difetto.'),

(23, 'Criteri di Ordinamento della Classifica: La classifica sarà determinata secondo i seguenti criteri: Punti, Somma punti totale, Gol fatti.');

-- ========================================
-- PARTE 3: VERIFICA FINALE
-- ========================================

-- Verifica che tutte le regole siano state inserite
SELECT COUNT(*) as total_rules FROM rules;

-- Mostra le prime 5 regole per verifica
SELECT rule_number, LEFT(content, 100) || '...' as content_preview 
FROM rules 
ORDER BY rule_number 
LIMIT 5;

-- Mostra tutte le tabelle create
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
