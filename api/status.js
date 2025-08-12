export default async function handler(req, res) {
  try {
    // URL del tuo bot su Render
    const botUrl =
      process.env.BOT_URL || "https://tuo-bot-su-render.onrender.com";

    console.log(`Checking bot status at: ${botUrl}`);

    // Controlla lo stato del bot
    const startTime = Date.now();
    const response = await fetch(botUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Vercel-Status-Check/1.0",
      },
    });
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      console.log("✅ Bot online! Response time:", responseTime + "ms");
      res.status(200).json({
        status: "online",
        message: "Bot è online e funzionante!",
        responseTime: responseTime + "ms",
        statusCode: response.status,
        timestamp: new Date().toISOString(),
        botUrl: botUrl,
      });
    } else {
      console.log("⚠️ Bot offline o errore. Status:", response.status);
      res.status(503).json({
        status: "offline",
        message: "Bot offline o errore",
        statusCode: response.status,
        responseTime: responseTime + "ms",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("❌ Errore nel controllo status:", error);
    res.status(500).json({
      status: "error",
      message: "Errore nel controllo status del bot",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
