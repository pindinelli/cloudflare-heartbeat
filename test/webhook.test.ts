import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { env } from 'cloudflare:workers'
import webhook from '../src/webhook'
import { sendNotification } from '../src/shared/telegram'

vi.mock('../src/shared/telegram', () => ({
    sendNotification: vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
}))

function webhookRequest(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost:8787/webhook', {
        method: 'POST',
        headers: {
            'X-Telegram-Bot-Api-Secret-Token': env.TELEGRAM_WEBHOOK_SECRET,
            ...headers,
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })
}

async function setHeartbeat(last_seen: number) {
    await env.SERVER_STATUS.put('heartbeat', JSON.stringify({ last_seen }))
}

async function setNotificationState(status: string) {
    await env.SERVER_STATUS.put(
        'notificationState',
        JSON.stringify({
            notification_status: status,
            notification_last_send: Date.now(),
        }),
    )
}

beforeEach(async () => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-21T14:32:00Z'))
    await env.SERVER_STATUS.delete('heartbeat')
    await env.SERVER_STATUS.delete('notificationState')
})

afterEach(() => {
    vi.useRealTimers()
})

describe('webhook handler', () => {
    it('rejects non-POST requests with 405', async () => {
        const request = new Request('http://localhost:8787/webhook', { method: 'GET' })
        const response = await webhook.fetch(request, env, {} as ExecutionContext)
        expect(response.status).toBe(405)
    })

    it('rejects requests with a missing or wrong secret with 401', async () => {
        const wrong = webhookRequest({ message: { text: '/status' } }, {
            'X-Telegram-Bot-Api-Secret-Token': 'wrong',
        })
        const response = await webhook.fetch(wrong, env, {} as ExecutionContext)
        expect(response.status).toBe(401)
        expect(sendNotification).not.toHaveBeenCalled()
    })

    it('returns 200 and sends last_seen and status on /status', async () => {
        await setHeartbeat(Date.now())
        await setNotificationState('OK')

        const response = await webhook.fetch(
            webhookRequest({ message: { chat: { id: 123 }, text: '/status' } }),
            env,
            {} as ExecutionContext,
        )

        expect(response.status).toBe(200)
        expect(sendNotification).toHaveBeenCalledOnce()
        const message = vi.mocked(sendNotification).mock.calls[0][1]
        expect(message).toContain('OK')
    })

    it('sends no_detection when no heartbeat has been recorded', async () => {
        const response = await webhook.fetch(
            webhookRequest({ message: { chat: { id: 123 }, text: '/status' } }),
            env,
            {} as ExecutionContext,
        )

        expect(response.status).toBe(200)
        expect(sendNotification).toHaveBeenCalledOnce()
    })

    it('sends command_message for unknown commands', async () => {
        const response = await webhook.fetch(
            webhookRequest({ message: { chat: { id: 123 }, text: '/help' } }),
            env,
            {} as ExecutionContext,
        )

        expect(response.status).toBe(200)
        expect(sendNotification).toHaveBeenCalledOnce()
    })

    it('returns 400 for malformed JSON', async () => {
        const response = await webhook.fetch(
            webhookRequest('not valid json'),
            env,
            {} as ExecutionContext,
        )

        expect(response.status).toBe(400)
    })
})