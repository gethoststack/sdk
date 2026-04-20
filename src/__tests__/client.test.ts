import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { HostStack } from '../client.ts';
import {
	AuthenticationError,
	HostStackError,
	NotFoundError,
	RateLimitError,
} from '../errors.ts';

interface MockCall {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string | null;
}

const originalFetch = globalThis.fetch;
let calls: MockCall[] = [];

function installMock(
	responder: (call: MockCall) => { status: number; body?: unknown },
) {
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : String(input);
		const method = init?.method ?? 'GET';
		const headers = Object.fromEntries(
			Object.entries(init?.headers ?? {}).map(([k, v]) => [k, String(v)]),
		);
		const body = typeof init?.body === 'string' ? init.body : null;
		const call: MockCall = { url, method, headers, body };
		calls.push(call);

		const { status, body: respBody } = responder(call);
		return new Response(respBody === undefined ? null : JSON.stringify(respBody), {
			status,
			headers: { 'Content-Type': 'application/json' },
		});
	}) as typeof globalThis.fetch;
}

beforeEach(() => {
	calls = [];
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe('HostStack client', () => {
	test('constructor requires an apiKey', () => {
		expect(() => new HostStack({ apiKey: '' })).toThrow(/apiKey/i);
	});

	test('defaults to https://api.hoststack.dev and strips trailing slash', () => {
		installMock(() => ({ status: 200, body: { ok: true } }));
		const client1 = new HostStack({ apiKey: 'hs_test_x' });
		const client2 = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://api.example.com/' });
		// Trigger one request each to observe the URL.
		void client1.request('GET', '/api/ping');
		void client2.request('GET', '/api/ping');
		// Both baseUrls are normalized.
		expect(calls.some((c) => c.url === 'https://api.hoststack.dev/api/ping')).toBe(true);
		expect(calls.some((c) => c.url === 'https://api.example.com/api/ping')).toBe(true);
	});

	test('sends Bearer auth + JSON content-type for bodied requests', async () => {
		installMock(() => ({ status: 200, body: { ok: true } }));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		await client.request('POST', '/api/echo', { a: 1 });
		expect(calls).toHaveLength(1);
		expect(calls[0]!.method).toBe('POST');
		expect(calls[0]!.headers.Authorization).toBe('Bearer hs_test_x');
		expect(calls[0]!.headers['Content-Type']).toBe('application/json');
		expect(calls[0]!.body).toBe(JSON.stringify({ a: 1 }));
	});

	test('omits Content-Type when body is undefined', async () => {
		installMock(() => ({ status: 200, body: { ok: true } }));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		await client.request('GET', '/api/ping');
		expect(calls[0]!.headers['Content-Type']).toBeUndefined();
	});

	test('throws AuthenticationError on 401', async () => {
		installMock(() => ({ status: 401, body: { error: 'bad key' } }));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		try {
			await client.request('GET', '/api/ping');
			throw new Error('expected throw');
		} catch (err: unknown) {
			expect(err).toBeInstanceOf(AuthenticationError);
			expect((err as Error).message).toBe('bad key');
		}
	});

	test('throws NotFoundError on 404', async () => {
		installMock(() => ({ status: 404, body: { error: 'missing' } }));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		await expect(client.request('GET', '/api/ping')).rejects.toBeInstanceOf(NotFoundError);
	});

	test('throws RateLimitError on 429', async () => {
		installMock(() => ({ status: 429, body: { error: 'slow down' } }));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		await expect(client.request('GET', '/api/ping')).rejects.toBeInstanceOf(RateLimitError);
	});

	test('throws generic HostStackError on 500', async () => {
		installMock(() => ({ status: 500, body: { error: 'boom' } }));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		try {
			await client.request('GET', '/api/ping');
			throw new Error('expected throw');
		} catch (err: unknown) {
			expect(err).toBeInstanceOf(HostStackError);
			expect((err as HostStackError).statusCode).toBe(500);
		}
	});

	test('returns undefined on 204 No Content', async () => {
		installMock(() => ({ status: 204 }));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		const result = await client.request<void>('DELETE', '/api/thing');
		expect(result).toBeUndefined();
	});

	test('exposes all resource modules', () => {
		const client = new HostStack({ apiKey: 'hs_test_x' });
		expect(client.projects).toBeDefined();
		expect(client.services).toBeDefined();
		expect(client.deploys).toBeDefined();
		expect(client.databases).toBeDefined();
		expect(client.domains).toBeDefined();
		expect(client.envVars).toBeDefined();
		expect(client.cron).toBeDefined();
	});
});
