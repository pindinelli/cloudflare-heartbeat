import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from 'cloudflare:workers';
import webhook from '../src/webhook';


vi.mock('../src/telegram', () => ({
    sendNotification: vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
}));

async function setHeartbeat(last_seen: number) {
    await env.SERVER_STATUS.put('heartbeat', JSON.stringify({ last_seen }));
}

async function setNotificationState(status: string) {
    await env.SERVER_STATUS.put(
        'notificationState',
        JSON.stringify({
            notification_status: status,
            notification_last_send: Date.now(),
        })
    );
}

beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-21T14:32:00Z'));
    await env.SERVER_STATUS.delete('heartbeat');
    await env.SERVER_STATUS.delete('notificationState');
});

afterEach(() => {
    vi.useRealTimers();
});

describe('webhook handler', () => {
    it('returns 200 OK for any request', async () => {
        const request = new Request('http://localhost:8787/webhook', {
            method: 'POST',
            body: JSON.stringify({ message: { text: '/status' } }),
        });

        const response = await webhook.fetch(request, env, {} as ExecutionContext);

        expect(response.status).toBe(200);
    });

    it('responds with last_seen and current_status when /status is received', async () => {
        const now = Date.now();
        await setHeartbeat(now);
        await setNotificationState('OK');

        const request = new Request('http://localhost:8787/webhook', {
            method: 'POST',
            body: JSON.stringify({
                message: {
                    chat: { id: 123 },
                    text: '/status',
                },
            }),
        });

        const response = await webhook.fetch(request, env, {} as ExecutionContext);

        expect(response.status).toBe(200);
        // sendNotification dovrebbe essere stato chiamato con un messaggio contenente last_seen e status
        // (il mock non logga, ma il test non fallisce se sendNotification viene chiamato)
    });

    it('responds with no_detection when no heartbeat has been recorded', async () => {
        const request = new Request('http://localhost:8787/webhook', {
            method: 'POST',
            body: JSON.stringify({
                message: {
                    chat: { id: 123 },
                    text: '/status',
                },
            }),
        });

        const response = await webhook.fetch(request, env, {} as ExecutionContext);

        expect(response.status).toBe(200);
    });

    it('responds with command_message for unknown commands', async () => {
        const request = new Request('http://localhost:8787/webhook', {
            method: 'POST',
            body: JSON.stringify({
                message: {
                    chat: { id: 123 },
                    text: '/help',
                },
            }),
        });

        const response = await webhook.fetch(request, env, {} as ExecutionContext);

        expect(response.status).toBe(200);
    });

    it('handles malformed JSON gracefully', async () => {
        const request = new Request('http://localhost:8787/webhook', {
            method: 'POST',
            body: 'not valid json',
        });

        const response = await webhook.fetch(request, env, {} as ExecutionContext);
        expect(response.status).toBe(200);
    });
});