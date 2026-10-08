import { getHeartBeatJson } from "../monitor"
import { requireEnv } from "../shared/env"
import { getTelegramLocale, DEFAULT_LANG } from "../shared/i18n"
import { sendNotification } from "../shared/telegram"
import { getLocaleConfig, TelegramBodyMessage } from "../shared/types"


export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        try {
            requireEnv(env, ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_WEBHOOK_SECRET'])
            
            if (request.method !== 'POST') {
                return new Response('Method not allowed', { status: 405 })
            }

            const received = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
            if (received !== env.TELEGRAM_WEBHOOK_SECRET) {
                return new Response('Unauthorized', { status: 401 })
            }
      
            const body = (await request.json().catch(() => null)) as TelegramBodyMessage | null

            if (body === null) {
                return new Response('Invalid JSON', { status: 400 })
            }
            const message = body?.message?.text
            const lang = env.NOTIFICATION_LANGUAGE || DEFAULT_LANG
            const telegramLocale = getTelegramLocale(lang)
            const localeConfig = getLocaleConfig(lang)
            let notificationMessage: string
            if (message === '/status') {
                const notificationState = await env.SERVER_STATUS.get('notificationState')

                const heartbeat = await getHeartBeatJson(env)
                const lastSeen = heartbeat?.last_seen ?? null

                const state = notificationState ? JSON.parse(notificationState) : null
                const status = state?.notification_status || 'UNKNOWN'
                if (lastSeen === null) {
                    notificationMessage = telegramLocale.no_detection
                } else {
                    const lastSeenDate = new Date(lastSeen)
                    notificationMessage =
                        `${telegramLocale?.last_seen}: ${lastSeenDate.toLocaleString(localeConfig.locale, {
                            timeZone: localeConfig.timeZone,
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit"
                        })}\n${telegramLocale?.current_status}: ${status}`;
                }
            } else {
                notificationMessage = telegramLocale?.command_message
            }
            await sendNotification(env, notificationMessage)
            return new Response('', { status: 200 })
        } catch (err) {
            console.error('Webhook error:', err)
            return new Response('', { status: 200 })
        }
    }
}