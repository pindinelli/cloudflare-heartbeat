import { Status, Heartbeat, NotificationState, ServiceStatus } from "../shared/types"
import { buildNotificationMessage, DEFAULT_LANG } from "../shared/i18n"
import { sendNotification } from "../shared/telegram"
import { requireEnv } from "../shared/env"


const MIN_WINDOW = 1

const MAX_WINDOW = 120

const DEFAULT_WINDOW = 10

const SECONDS_PER_MINUTE = 60

const MS_PER_SECOND = 1000

export function parseWindowMinutes(rawEnvVal: string | undefined) {
	const parsed = Number(rawEnvVal);
	if (!rawEnvVal || Number.isNaN(parsed)) {
		return DEFAULT_WINDOW;
	}

	const integerVal = Math.floor(parsed)

	return Math.min(Math.max(integerVal, MIN_WINDOW), MAX_WINDOW)
}

export async function getHeartBeatJson(env: Env): Promise<undefined | Heartbeat>  {
	const heartbeat = await env.SERVER_STATUS.get('heartbeat')
	if (heartbeat) 
	return JSON.parse(heartbeat)
}

export async function runCheck(env: Env): Promise<void> {
	const heartbeatJson = await getHeartBeatJson(env)
	if (!heartbeatJson) return;
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
		await setKvKey(env, "notificationState", newState);

		const lang = env.NOTIFICATION_LANGUAGE || DEFAULT_LANG
		const message = buildNotificationMessage(currentStatus, lang)
		await sendNotification(env, message)
	}
}

export function isTimedOut(minutes: number, lastSeen: number): boolean {
	const now = Date.now()
	console.log(now, lastSeen, minutes * SECONDS_PER_MINUTE * MS_PER_SECOND)
	if (!Number.isFinite(lastSeen)) return true
	return now - lastSeen > minutes * SECONDS_PER_MINUTE * MS_PER_SECOND
}

async function setKvKey(env: Env, key: string, value: ServiceStatus) {
	await env.SERVER_STATUS.put(key, JSON.stringify(value))
}


export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		try {
			requireEnv(env, ['APP_TOKEN'])

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
			return new Response(JSON.stringify({ "error": "Internal error" }), {
				status: 500,
				headers: { "Content-Type": "application/json" }
			})
		}
	},
	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {

		try {
			await runCheck(env);
		} catch (err) {
			console.error(
				'Errore in scheduled:',
				err instanceof Error ? err.message : err
			)
		}
	}
}
