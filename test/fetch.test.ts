import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

beforeEach(async () => {
    await env.SERVER_STATUS.delete('heartbeat');
    await env.SERVER_STATUS.delete('notificationState');
});

describe('fetch handler', () => {
    it('rejects requests with a missing or wrong Authorization header', async () => {
        const request = new IncomingRequest('https://example.com/', {
            headers: { Authorization: 'Bearer wrong-token' },
        });
        const ctx = createExecutionContext();

        const response = await worker.fetch(request, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(401);
    });

    it('accepts a valid Bearer token and stores the heartbeat', async () => {
        const request = new IncomingRequest('https://example.com/', {
            headers: { Authorization: `Bearer ${env.APP_TOKEN}` },
        });
        const ctx = createExecutionContext();

        const response = await worker.fetch(request, env, ctx);
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);

        const body = await response.json<{ last_seen: number }>();
        expect(body.last_seen).toBeTypeOf('number');

        const stored = await env.SERVER_STATUS.get('heartbeat');
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored!).last_seen).toBe(body.last_seen);
    });

    it('works end-to-end through SELF.fetch as well', async () => {
        const response = await SELF.fetch('https://example.com/', {
            headers: { Authorization: `Bearer ${env.APP_TOKEN}` },
        });

        expect(response.status).toBe(200);
    });
});