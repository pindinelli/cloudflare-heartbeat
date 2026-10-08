import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env, exports } from 'cloudflare:workers'
import { describe, it, expect, beforeEach } from 'vitest'
import worker from '../src/monitor/index'

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>

beforeEach(async () => {
    await env.SERVER_STATUS.delete('heartbeat')
    await env.SERVER_STATUS.delete('notificationState')
})

describe('fetch handler', () => {
    it('rejects requests with a missing or wrong Authorization header', async () => {
        const request = new IncomingRequest('https://example.com/', {
            headers: { Authorization: 'Bearer wrong-token' },
        })
        const ctx = createExecutionContext()

        const response = await worker.fetch(request, env, ctx)
        await waitOnExecutionContext(ctx)

        expect(response.status).toBe(401)
    })

    it('accepts a valid Bearer token and stores the heartbeat', async () => {
        const request = new IncomingRequest('https://example.com/', {
            headers: { Authorization: `Bearer ${env.APP_TOKEN}` },
        })
        const ctx = createExecutionContext()

        const response = await worker.fetch(request, env, ctx)
        await waitOnExecutionContext(ctx)

        expect(response.status).toBe(200)

        const body = await response.json<{ last_seen: number }>()
        expect(body.last_seen).toBeTypeOf('number')

        const stored = await env.SERVER_STATUS.get('heartbeat')
        expect(stored).not.toBeNull()
        expect(JSON.parse(stored!).last_seen).toBe(body.last_seen)
    })
    it('works end-to-end through the runtime fetch', async () => {
        const main = (exports as unknown as { default: Fetcher }).default

        const response = await main.fetch('https://example.com/', {
            headers: { Authorization: `Bearer ${env.APP_TOKEN}` },
        })

        expect(response.status).toBe(200)
    })
}) 