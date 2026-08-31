import { getStore } from "@netlify/blobs";
import seed from "../data/tornate.seed.json" with { type: "json" };
import { sendMessage } from "./telegram";
import { announceTornataStart, getOverrideInizio } from "./tornateBuste";

export type Tornata = { id: number; inizio: string; fine: string };

const CHAT_ID = -1002779838745;
const SENT_BLOB_KEY = "sent";

const THRESHOLDS = [
  { minutesBefore: 45, label: "45", suffix: "45" },
  { minutesBefore: 5, label: "5", suffix: "5" },
] as const;

function store() {
  return getStore("tornate-reminders");
}

async function getSent(): Promise<string[]> {
  const data = await store().get(SENT_BLOB_KEY, { type: "json" });
  return (data as string[]) || [];
}

async function markSent(key: string): Promise<void> {
  const sent = await getSent();
  if (!sent.includes(key)) {
    sent.push(key);
    await store().setJSON(SENT_BLOB_KEY, sent);
  }
}

export async function checkAndSendTornateReminders(now = new Date()): Promise<void> {
  const tornate = seed as Tornata[];
  const sent = await getSent();

  for (const tornata of tornate) {
    const inizioKey = `${tornata.id}-inizio`;
    if (!sent.includes(inizioKey)) {
      const overrideInizioMs = await getOverrideInizio(tornata.id);
      const inizioMs =
        overrideInizioMs !== null
          ? Math.min(overrideInizioMs, new Date(tornata.inizio).getTime())
          : new Date(tornata.inizio).getTime();
      if (now.getTime() >= inizioMs) {
        await announceTornataStart(tornata);
        await markSent(inizioKey);
      }
    }

    const fine = new Date(tornata.fine);
    if (fine.getTime() <= now.getTime()) continue;

    for (const threshold of THRESHOLDS) {
      const key = `${tornata.id}-${threshold.suffix}`;
      if (sent.includes(key)) continue;

      const triggerAt = new Date(fine.getTime() - threshold.minutesBefore * 60_000);
      if (now.getTime() >= triggerAt.getTime()) {
        const oraFine = fine.toLocaleTimeString("it-IT", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Rome",
        });
        await sendMessage(
          CHAT_ID,
          `⏰ Mancano ${threshold.label} minuti alla fine della tornata (${oraFine})!`
        );
        await markSent(key);
      }
    }
  }
}
