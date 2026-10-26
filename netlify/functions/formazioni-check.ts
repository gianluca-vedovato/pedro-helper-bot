import { connectLambda } from "@netlify/blobs";
import { checkRecoveredLineups } from "./services/formazioniCheck";

export async function handler(event: any) {
  try {
    if (event?.blobs) connectLambda(event);
    await checkRecoveredLineups();
    return { statusCode: 200, body: "ok" };
  } catch (error) {
    console.error("❌ Errore formazioni-check:", error);
    return { statusCode: 500, body: "error" };
  }
}
