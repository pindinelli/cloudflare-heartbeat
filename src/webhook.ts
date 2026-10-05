import { getHeartBeatJson } from "."
import { getTelegramLocale, DEFAULT_LANG } from "./i18n"
import { sendNotification } from "./telegram"
import { getLocaleConfig, TelegramBodyMessage } from "./types"


export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
        try {
            const body: TelegramBodyMessage = await request.json()
            const message = body?.message?.text
            let notificationMessage: string
            const lang = env.NOTIFICATION_LANGUAGE || DEFAULT_LANG
            const telegramLocale = getTelegramLocale(lang)
            const localeConfig = getLocaleConfig(lang)

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
        } catch (err) {
            console.error('Webhook error:', err)
        } finally {
            return new Response('', { status: 200 })
        }
    }
}