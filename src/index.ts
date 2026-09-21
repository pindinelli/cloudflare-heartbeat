import { Status } from "./Status"
import { parseLang, buildNotificationMessage } from "./i18n"

const MIN_WINDOW = 1

const MAX_WINDOW = 120

const DEFAULT_WINDOW = 10

type Heartbeat = {
	last_seen: number
}

export type NotificationState = {
	notification_status: Status | null
	notification_last_send: number | null
}

type ServiceStatus = Heartbeat | NotificationState

export function parseWindowMinutes(rawEnvVal: string | undefined) {
	const parsed = Number(rawEnvVal);

	if (!rawEnvVal || Number.isNaN(parsed)) {
		return DEFAULT_WINDOW;
	}

	const integerVal = Math.floor(parsed)

	return Math.min(Math.max(integerVal, MIN_WINDOW), MAX_WINDOW)
}


export async function runCheck(env: Env): Promise<void> {
	const heartbeat = await env.SERVER_STATUS.get('heartbeat')
	if (!heartbeat) return;

	const heartbeatJson: Heartbeat = JSON.parse(heartbeat)

	const notificationState = await env.SERVER_STATUS.get('notificationState')

	let notificationStateJson: NotificationState

	if (!notificationState) {
		notificationStateJson = {
			notification_status: null,
			notification_last_send: null
		}
	} else {
		notificationStateJson = JSON.parse(notificationState)
	}

	const { notification_status } = notificationStateJson

	const minutes = parseWindowMinutes(env.LAST_SEEN_WINDOW_MINUTES)

	const last_seen = Number(heartbeatJson.last_seen)

	const currentStatus = isTimedOut(minutes, last_seen) ? Status.Down : Status.Up

	const firstRun = notification_status === null

	if (firstRun) {
		await setKvKey(env, "notificationState", {
			notification_status: currentStatus,
			notification_last_send: null
		})
	} else if (currentStatus !== notification_status) {
		const newState = {
			notification_status: currentStatus,
			notification_last_send: Date.now()
		}

		const lang = parseLang(env.NOTIFICATION_LANGUAGE)
		const message = buildNotificationMessage(currentStatus, lang)

		await setKvKey(env, "notificationState", newState);
		await sendNotification(env, message)
	}
}

export function isTimedOut(minutes: number, last_seen: number) {
	const thresholdMs = Number(minutes) * 60 * 1000
	const lastSeenTime = new Date(last_seen).getTime()
	const now = Date.now()
	return (now - lastSeenTime) > thresholdMs
}

async function sendNotification(env: Env, message: string) {
	const telegramBotToken = env.TELEGRAM_BOT_TOKEN
	const telegramChatID = env.TELEGRAM_CHAT_ID

	return fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			chat_id: telegramChatID,
			text: message
		})
	});
}

async function setKvKey(env: Env, key: string, value: ServiceStatus) {
	await env.SERVER_STATUS.put(key, JSON.stringify(value))
}

function validateEnv(env: Env) {
	if (!env.APP_TOKEN) {
		throw new Error("Missing APP_TOKEN")
	}

	if (!env.TELEGRAM_BOT_TOKEN) {
		throw new Error("Missing TELEGRAM_BOT_TOKEN")
	}

	if (!env.TELEGRAM_CHAT_ID) {
		throw new Error("Missing TELEGRAM_CHAT_ID")
	}
}


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		try {
			validateEnv(env)

			const authHeader = request.headers.get("Authorization")

			const bearerToken = env.APP_TOKEN

			const expectedToken = `Bearer ${bearerToken}`

			if (authHeader !== expectedToken) {
				return new Response('{"error": "Invalid token"}', { "status": 401 })
			}

			const heartbeat = {
				last_seen: Date.now()
			}

			await setKvKey(env, "heartbeat", heartbeat)

			return new Response(JSON.stringify(heartbeat), {
				headers: { "Content-Type": "application/json" }
			})
		} catch (err) {
			console.error(
				'Errore in worker:',
				err instanceof Error ? err.message : err
			);
			return new Response(JSON.stringify({ error: "Internal error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" }
			})
		}
	},
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
		try {
			validateEnv(env)
			await runCheck(env);
		} catch (err) {
			console.error(
				'Errore in scheduled:',
				err instanceof Error ? err.message : err
			)
		}
	}
}
