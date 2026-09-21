import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { Status } from '../src/Status';
import { runCheck, type NotificationState } from '../src/index';

vi.stubGlobal(
	'fetch',
	vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
);

async function getNotificationState(): Promise<NotificationState | null> {
	const raw = await env.SERVER_STATUS.get('notificationState');
	return raw ? JSON.parse(raw) : null;
}

async function setHeartbeat(last_seen: number) {
	await env.SERVER_STATUS.put('heartbeat', JSON.stringify({ last_seen }));
}

beforeEach(async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
	await env.SERVER_STATUS.delete('heartbeat');
	await env.SERVER_STATUS.delete('notificationState');
	(fetch as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('runCheck', () => {
	it('does nothing if no heartbeat has ever been recorded', async () => {
		await runCheck(env);

		expect(await getNotificationState()).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('on first run, stores the initial status without sending a notification', async () => {
		await setHeartbeat(Date.now());

		await runCheck(env);

		const state = await getNotificationState();
		expect(state?.notification_status).toBe(Status.Up);
		expect(state?.notification_last_send).toBeNull();
		expect(fetch).not.toHaveBeenCalled();
	});

	it('does not notify again if the status has not changed', async () => {
		await setHeartbeat(Date.now());
		await runCheck(env);
		await runCheck(env);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('sends a notification when the status changes from UP to DOWN', async () => {
		await setHeartbeat(Date.now());
		await runCheck(env); // first run: stores UP silently
		vi.setSystemTime(new Date('2026-01-01T12:15:00Z'));

		await runCheck(env);

		const state = await getNotificationState();
		expect(state?.notification_status).toBe(Status.Down);
		expect(state?.notification_last_send).not.toBeNull();
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('does not spam notifications on repeated DOWN checks', async () => {
		await setHeartbeat(Date.now());
		await runCheck(env);

		vi.setSystemTime(new Date('2026-01-01T12:15:00Z'));
		await runCheck(env);

		await runCheck(env);

		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it('sends a notification when the status recovers from DOWN to UP', async () => {
		await setHeartbeat(Date.now());
		await runCheck(env);

		vi.setSystemTime(new Date('2026-01-01T12:15:00Z'));
		await runCheck(env);
		await setHeartbeat(Date.now());
		await runCheck(env);

		const state = await getNotificationState();
		expect(state?.notification_status).toBe(Status.Up);
		expect(fetch).toHaveBeenCalledTimes(2);
	});
});