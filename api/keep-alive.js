export default async function handler(req, res) {
  try {
    // URL del tuo bot su Render (da sostituire con quello reale)
    const botUrl =
      process.env.BOT_URL || "https://tuo-bot-su-render.onrender.com";

    console.log(`Pinging bot at: ${botUrl}`);

    // Ping al bot per mantenerlo sveglio
    const response = await fetch(botUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Vercel-Cron-KeepAlive/1.0",
      },
    });

    if (response.ok) {
      console.log("✅ Bot mantenuto sveglio! Status:", response.status);
      res.status(200).json({
        status: "success",
        message: "Bot mantenuto sveglio!",
        timestamp: new Date().toISOString(),
        botUrl: botUrl,
      });
    } else {
      console.log("⚠️ Errore nel ping al bot. Status:", response.status);
      res.status(500).json({
        status: "error",
        message: "Errore nel ping al bot",
        statusCode: response.status,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("❌ Errore critico:", error);
    res.status(500).json({
      status: "error",
      message: "Errore critico nel keep-alive",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
