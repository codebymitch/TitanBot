# R.E.D.T.I.E - Superuser Discord Intelligence

R.E.D.T.I.E è un layer intelligente che potenzia MEE6, non lo sostituisce.
MEE6 gestisce XP, livelli e moderazione base. R.E.D.T.I.E aggiunge cervello, automazione e controllo totale.

> Built with discord.js v14, Supabase, Lavalink v4, Groq & HuggingFace.

### Core Concept: MEE6 + R.E.D.T.I.E

- **MEE6** = operaio (fa il lavoro sporco)
- **R.E.D.T.I.E** = manager (controlla, migliora, automatizza)

### Funzionalità

#### 1. Staff Oversight
Monitora Helper, Sr Mod, Admin (escluso Owner). Logga timeout, kick, ban, warn via Audit Log. Traccia attività, tempi di risposta ticket, assenze. Sistema di flag L1/L2/L3 con report solo Owner/Admin.

#### 2. Gestione Ticket Avanzata (MEE6 Integrated)
Intercetta i ticket creati da MEE6, legge il motivo di apertura e risponde con IA (Groq). Escalation automatica a staff umano solo se serve. Traccia tempi di risposta.

#### 3. Messaggi Intelligenti
`/say #canale messaggio anon:true` -> manda come bot senza mostrare lo staffer.
`/schedule #canale 20:00 messaggio repeat:daily` -> messaggi programmati che sopravvivono al restart.

#### 4. Server Health & Rules
`/server audit` -> ti dice cosa non va: canali morti, ruoli con permessi pericolosi, configurazioni errate.
`/rules generate` -> genera regolamento con IA in base al server.

#### 5. Animazione Community
Se la chat è morta, propone in #staff-ideas eventi: giveaway, trivia, Q&A. Genera annunci con immagini IA (HuggingFace).

#### 6. Agente IA Centrale
`/redtie ask domanda` -> cervello con memoria a lungo termine su Supabase Vector (ticket, staff, attività).
Risponde se taggato nei messaggi.

#### 7. Musica 24/7
Lavalink v4 con supporto Spotify, YouTube, Deezer, Apple Music. Comandi `/play`, `/join`, `/queue`, bottoni interattivi.

### Setup

1. `cp .env.example .env` -> inserisci DISCORD_TOKEN, CLIENT_ID, SUPABASE_URL, SUPABASE_KEY, GROQ_API_KEY, HF_TOKEN
2. `npm install`
3. Su Supabase lancia `supabase/migrations.sql`
4. `docker compose up -d --build` o `npm start`

### Env Richiesti

DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=
SUPABASE_URL=
SUPABASE_KEY=
GROQ_API_KEY=
HF_TOKEN=