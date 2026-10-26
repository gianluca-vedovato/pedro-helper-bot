import { getStore } from "@netlify/blobs";
import { sendMessage } from "./telegram";

const CHAT_ID = -1002779838745;
const LEAGUE_ALIAS = "fantafioi-league";
const COMPETITION_ID = 79171;
const API_BASE = "https://apileague.fantacalcio.it";
// app_key pubblica della web app leghe.fantacalcio.it (è nel bundle JS del sito)
const APP_KEY = "ICiELOObd5DF5uJEATi77CRvHiiRuMU0";
const STATE_BLOB_KEY = "state";
// Calendario Serie A (community openfootball): giornata, data e ora in orario di Roma
const SERIE_A_CALENDAR_URL =
  "https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/it.1.json";
// Il controllo parte un'ora dopo il primo calcio d'inizio della giornata
const CHECK_DELAY_MS = 60 * 60 * 1000;
// Le giornate con il primo calcio d'inizio più vecchio di così non vengono controllate: evita di rimandare lo storico al primo deploy
const KICKOFF_WINDOW_MS = 25 * 60 * 60 * 1000;

// Valori di `act` nella risposta teamLineup: 0 web, 1 app, 2 admin, 3 tavolino, 4 recuperata dal sistema
const LINEUP_RECOVERED = 4;

type CalendarRound = {
  matchDay: number;
  championshipMatchDay: number;
  calculated: boolean;
  matches: { tIdH: number; tIdA: number }[];
};

type TeamLineup = { tid?: number; act?: number };

type TeamsPage = {
  nextPage: boolean;
  data: { id: number; n: string; nu: string }[];
};

type SerieAMatch = { round: string; date: string; time?: string };

// Giornate di Serie A già controllate e numero di formazioni non inserite per squadra (chiave: id squadra)
type CheckState = { checkedMatchDays: number[]; missingCounts: Record<string, number> };

function store() {
  return getStore("formazioni-check");
}

async function getState(): Promise<CheckState> {
  const data = (await store().get(STATE_BLOB_KEY, { type: "json" })) as Partial<CheckState> | null;
  return { checkedMatchDays: data?.checkedMatchDays ?? [], missingCounts: data?.missingCounts ?? {} };
}

async function saveState(state: CheckState): Promise<void> {
  await store().setJSON(STATE_BLOB_KEY, state);
}

// Converte data e ora scritte in orario di Roma nell'istante corrispondente
function romeToDate(date: string, time = "00:00"): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const romeAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(asUtc - (romeAsUtc - asUtc));
}

// Giornate di Serie A iniziate da almeno un'ora (entro la finestra) e non ancora controllate
async function getStartedMatchDays(checked: number[], now: Date): Promise<number[]> {
  const res = await fetch(SERIE_A_CALENDAR_URL);
  if (!res.ok) throw new Error(`Calendario Serie A non disponibile: ${res.status}`);
  const { matches } = (await res.json()) as { matches: SerieAMatch[] };

  const firstKickoff = new Map<number, number>();
  for (const match of matches) {
    const matchDay = Number(match.round.replace(/\D/g, ""));
    const kickoff = romeToDate(match.date, match.time).getTime();
    if (!firstKickoff.has(matchDay) || kickoff < firstKickoff.get(matchDay)!) firstKickoff.set(matchDay, kickoff);
  }

  return [...firstKickoff.entries()]
    .filter(([matchDay, kickoff]) => {
      const elapsed = now.getTime() - kickoff;
      return elapsed >= CHECK_DELAY_MS && elapsed <= KICKOFF_WINDOW_MS && !checked.includes(matchDay);
    })
    .map(([matchDay]) => matchDay)
    .sort((a, b) => a - b);
}

async function login(): Promise<string> {
  const username = process.env.FANTACALCIO_USERNAME;
  const password = process.env.FANTACALCIO_PASSWORD;
  if (!username || !password) {
    throw new Error("Missing FANTACALCIO_USERNAME or FANTACALCIO_PASSWORD");
  }

  const res = await fetch(`${API_BASE}/onboarding/v1/login`, {
    method: "POST",
    headers: { accept: "application/json", "Content-Type": "application/json", app_key: APP_KEY },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`Login Fantacalcio fallito: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }

  const body = await res.json();
  const data = body?.data ?? body;
  const leghe = Object.values(data?.leghe ?? {}) as { alias?: string; jwt?: string }[];
  const jwt = leghe.find((lega) => lega.alias === LEAGUE_ALIAS)?.jwt;
  if (!jwt) {
    throw new Error(`Token della lega ${LEAGUE_ALIAS} non trovato nella risposta di login`);
  }
  return jwt;
}

async function apiGet<T>(path: string, jwt: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { accept: "application/json", app_key: APP_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} fallita: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

async function getTeamLabels(jwt: string): Promise<Map<number, string>> {
  const labels = new Map<number, string>();
  for (let page = 1; ; page++) {
    const res = await apiGet<TeamsPage>(`/onboarding/v1/league/teams?page=${page}`, jwt);
    for (const team of res.data) labels.set(team.id, `${team.n} (${team.nu})`);
    if (!res.nextPage) return labels;
  }
}

export async function checkRecoveredLineups(now = new Date()): Promise<void> {
  const state = await getState();
  const matchDays = await getStartedMatchDays(state.checkedMatchDays, now);
  if (matchDays.length === 0) return;

  const jwt = await login();
  const calendar = await apiGet<CalendarRound[]>(
    `/onboarding/v1/league/competition/calendar/${COMPETITION_ID}`,
    jwt
  );

  let teamLabels: Map<number, string> | null = null;
  const label = (tid: number | string) => teamLabels?.get(Number(tid)) ?? `Squadra ${tid}`;

  for (const matchDay of matchDays) {
    // Giornata di Serie A senza giornata corrispondente nella lega: niente da controllare
    const round = calendar.find((item) => item.championshipMatchDay === matchDay);
    if (!round) {
      state.checkedMatchDays = [...state.checkedMatchDays, matchDay];
      await saveState(state);
      continue;
    }

    const recoveredTeamIds: number[] = [];
    for (const match of round.matches) {
      const lineup = await apiGet<{ home?: TeamLineup; away?: TeamLineup }>(
        `/gaming/v1/teamLineup/${COMPETITION_ID}/${round.matchDay}/${round.championshipMatchDay}/${match.tIdH}/${match.tIdA}`,
        jwt
      );
      if (lineup.home?.act === LINEUP_RECOVERED) recoveredTeamIds.push(match.tIdH);
      if (lineup.away?.act === LINEUP_RECOVERED) recoveredTeamIds.push(match.tIdA);
    }

    const missingCounts = { ...state.missingCounts };
    for (const tid of recoveredTeamIds) missingCounts[tid] = (missingCounts[tid] ?? 0) + 1;

    if (recoveredTeamIds.length > 0) {
      teamLabels ??= await getTeamLabels(jwt);
      const lista = recoveredTeamIds.map((tid) => `• ${label(tid)}`).join("\n");
      const conteggi = Object.entries(missingCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([tid, count]) => `• ${label(tid)}: ${count}`)
        .join("\n");
      await sendMessage(
        CHAT_ID,
        `📋 Giornata ${matchDay}: formazione recuperata dal sistema per\n${lista}\n\n` +
          `Formazioni non inserite finora:\n${conteggi}`
      );
    }

    // Conteggi e giornata controllata salvati insieme, dopo l'invio: se qualcosa fallisce la giornata viene ricontrollata
    state.missingCounts = missingCounts;
    state.checkedMatchDays = [...state.checkedMatchDays, matchDay];
    await saveState(state);
  }
}
