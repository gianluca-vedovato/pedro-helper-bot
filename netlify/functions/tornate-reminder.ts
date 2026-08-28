import { connectLambda } from "@netlify/blobs";
import { checkAndSendTornateReminders } from "./services/tornateReminders";

export async function handler(event: any) {
  try {
    if (event?.blobs) connectLambda(event);
    await checkAndSendTornateReminders();
    return { statusCode: 200, body: "ok" };
  } catch (error) {
    console.error("❌ Errore tornate-reminder:", error);
    return { statusCode: 500, body: "error" };
  }
}
