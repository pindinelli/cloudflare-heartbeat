export async function sendNotification(env: Env, message: string) {
    
    const telegramBotToken = env.TELEGRAM_BOT_TOKEN
    const telegramChatID = env.TELEGRAM_CHAT_ID

    console.log(message, telegramBotToken, telegramChatID)

    return fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: telegramChatID,
            text: message
        })
    });
}