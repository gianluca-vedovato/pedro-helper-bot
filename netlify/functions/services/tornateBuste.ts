import { getStore } from "@netlify/blobs";
import type { InlineKeyboardMarkup } from "telegraf/types";
import partecipantiSeed from "../data/partecipanti.seed.json" with { type: "json" };
import { sendMessageWithKeyboard, pinMessage, unpinMessage, sendMessage } from "./telegram";
import type { Tornata } from "./tornateReminders";

export type Partecipante = { name: string; username?: string; id?: number };

type TornataBusteState = {
  messageId: number;
  confirmed: string[];
  opened: boolean;
};

const CHAT_ID = -1002779838745;
const PARTECIPANTI = partecipantiSeed as Partecipante[];
const LAST_PINNED_KEY = "last-pinned-message-id";

function store() {
  return getStore("tornate-buste");
}

function stateKey(tornataId: number) {
  return `tornata-${tornataId}`;
}

function participantKey(p: Partecipante): string {
  return p.username ? p.username.toLowerCase() : `id:${p.id}`;
}

export function matchParticipant(from: {
  id: number;
  username?: string;
}): Partecipante | null {
  const byUsername = from.username
    ? PARTECIPANTI.find(
        (p) => p.username && p.username.toLowerCase() === from.username!.toLowerCase()
      )
    : undefined;
  if (byUsername) return byUsername;
  return PARTECIPANTI.find((p) => p.id === from.id) || null;
}

async function getState(tornataId: number): Promise<TornataBusteState | null> {
  const data = await store().get(stateKey(tornataId), { type: "json" });
  return (data as TornataBusteState) || null;
}

async function setState(tornataId: number, state: TornataBusteState): Promise<void> {
  await store().setJSON(stateKey(tornataId), state);
}

export function buildMessageText(tornataId: number, confirmedKeys: string[]): string {
  const fatti = PARTECIPANTI.filter((p) => confirmedKeys.includes(participantKey(p)));
  const mancanti = PARTECIPANTI.filter((p) => !confirmedKeys.includes(participantKey(p)));

  const lines = [
    `🟢 Tornata ${tornataId} iniziata! Inserite tutte le buste sulla piattaforma e confermate qui sotto.`,
    "",
    `✅ Fatto (${fatti.length}/${PARTECIPANTI.length}):`,
    fatti.length ? fatti.map((p) => `• ${p.name}`).join("\n") : "—",
    "",
    "⬜ Manca:",
    mancanti.length ? mancanti.map((p) => `• ${p.name}`).join("\n") : "—",
  ];
  return lines.join("\n");
}

export function buildKeyboard(tornataId: number): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: "✅ Ho inserito tutte le buste",
          callback_data: `busta:${tornataId}`,
        },
      ],
    ],
  };
}

export async function announceTornataStart(tornata: Tornata): Promise<void> {
  const text = buildMessageText(tornata.id, []);
  const keyboard = buildKeyboard(tornata.id);
  const message = await sendMessageWithKeyboard(CHAT_ID, text, keyboard);

  await setState(tornata.id, {
    messageId: message.message_id,
    confirmed: [],
    opened: false,
  });

  const lastPinned = await store().get(LAST_PINNED_KEY, { type: "json" });
  if (lastPinned && typeof lastPinned === "number") {
    try {
      await unpinMessage(CHAT_ID, lastPinned);
    } catch (error) {
      console.error("❌ Errore unpin messaggio precedente:", error);
    }
  }

  try {
    await pinMessage(CHAT_ID, message.message_id);
    await store().setJSON(LAST_PINNED_KEY, message.message_id);
  } catch (error) {
    console.error("❌ Errore pin messaggio tornata:", error);
  }
}

export async function toggleConfirmation(
  tornataId: number,
  from: { id: number; username?: string }
): Promise<
  | { ok: false; reason: "not-participant" | "no-state" }
  | { ok: true; state: TornataBusteState; toggledOn: boolean; justOpened: boolean }
> {
  const participant = matchParticipant(from);
  if (!participant) return { ok: false, reason: "not-participant" };

  const state = await getState(tornataId);
  if (!state) return { ok: false, reason: "no-state" };

  const key = participantKey(participant);
  const idx = state.confirmed.indexOf(key);
  const toggledOn = idx === -1;
  const confirmed = toggledOn
    ? [...state.confirmed, key]
    : state.confirmed.filter((k) => k !== key);

  const alreadyOpened = state.opened;
  const willOpen = !alreadyOpened && confirmed.length >= PARTECIPANTI.length;

  const newState: TornataBusteState = {
    ...state,
    confirmed,
    opened: alreadyOpened || willOpen,
  };
  await setState(tornataId, newState);

  return { ok: true, state: newState, toggledOn, justOpened: willOpen };
}

export async function sendBusteApertePerTornata(tornataId: number): Promise<void> {
  await sendMessage(CHAT_ID, `🔓 Tutti hanno confermato per la tornata ${tornataId}: si aprono le buste!`);
}
