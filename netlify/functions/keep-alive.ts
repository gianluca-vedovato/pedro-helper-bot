import { getSupabase } from "./services/db";

export async function handler() {
  const supabase = getSupabase();
  if (!supabase) {
    console.error("❌ keep-alive: Supabase non configurato");
    return { statusCode: 500, body: "Supabase non configurato" };
  }

  const { error } = await supabase.from("rules").select("rule_number").limit(1);
  if (error) {
    console.error("❌ keep-alive: errore query Supabase:", error);
    return { statusCode: 500, body: "Errore query Supabase" };
  }

  console.log("✅ keep-alive: ping Supabase riuscito");
  return { statusCode: 200, body: "ok" };
}
