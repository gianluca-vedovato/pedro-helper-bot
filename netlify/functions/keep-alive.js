exports.handler = async function (event, context) {
  try {
    // URL del tuo bot su Render
    const botUrl =
      process.env.BOT_URL || "https://tuo-bot-su-render.onrender.com";

    console.log(`Pinging bot at: ${botUrl}`);

    // Ping al bot per mantenerlo sveglio
    const response = await fetch(botUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Netlify-Cron-KeepAlive/1.0",
      },
    });

    if (response.ok) {
      console.log("✅ Bot mantenuto sveglio! Status:", response.status);
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: "success",
          message: "Bot mantenuto sveglio!",
          timestamp: new Date().toISOString(),
          botUrl: botUrl,
        }),
      };
    } else {
      console.log("⚠️ Errore nel ping al bot. Status:", response.status);
      return {
        statusCode: 500,
        body: JSON.stringify({
          status: "error",
          message: "Errore nel ping al bot",
          statusCode: response.status,
          timestamp: new Date().toISOString(),
        }),
      };
    }
  } catch (error) {
    console.error("❌ Errore critico:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        status: "error",
        message: "Errore critico nel keep-alive",
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
