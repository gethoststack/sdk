import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { HostStack } from '../client.ts';
import { AuthenticationError, HostStackError, NotFoundError, RateLimitError } from '../errors.ts';

/** The `…Resource` instances the client actually constructed, by class name. */
function resourceClassNames(client: HostStack): string[] {
	return Object.values(client as unknown as Record<string, unknown>)
		.map((value) => (value === null || value === undefined ? '' : value.constructor.name))
		.filter((name) => name.endsWith('Resource'))
		.sort();
}

/**
 * The `…Resource` classes that exist as modules under `src/resources`, derived
 * from the filenames — one kebab-case file per PascalCase class, which every
 * resource follows (`service-resource-links.ts` → `ServiceResourceLinksResource`).
 * A file that breaks the convention shows up here as a missing class, which is
 * the right thing to fail on either way.
 */
function resourceModuleClassNames(): string[] {
	const dir = path.resolve(import.meta.dir, '..', 'resources');
	return fs
		.readdirSync(dir)
		.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
		.map(
			(file) =>
				file
					.replace(/\.ts$/, '')
					.split('-')
					.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
					.join('') + 'Resource',
		)
		.sort();
}

interface MockCall {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string | null;
}

const originalFetch = globalThis.fetch;
let calls: MockCall[] = [];

function installMock(responder: (call: MockCall) => { status: number; body?: unknown }) {
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

	test('defaults to https://hoststack.dev and strips trailing slash', () => {
		installMock(() => ({ status: 200, body: { ok: true } }));
		const client1 = new HostStack({ apiKey: 'hs_test_x' });
		const client2 = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://api.example.com/' });
		// Trigger one request each to observe the URL.
		void client1.request('GET', '/api/ping');
		void client2.request('GET', '/api/ping');
		// Both baseUrls are normalized.
		expect(calls.some((c) => c.url === 'https://hoststack.dev/api/ping')).toBe(true);
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

	test('a request-validation 400 carries the issue text, never [object Object] (task 417)', async () => {
		installMock(() => ({
			status: 400,
			body: {
				success: false,
				error: {
					name: 'ZodError',
					message: JSON.stringify([
						{
							code: 'invalid_format',
							path: ['key'],
							message: 'Key must start with a letter',
						},
					]),
				},
			},
		}));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		try {
			await client.request('POST', '/api/ping', { key: '1A' });
			throw new Error('expected throw');
		} catch (err: unknown) {
			expect(err).toBeInstanceOf(HostStackError);
			expect((err as Error).message).toBe('key: Key must start with a letter');
		}
	});

	test('returns undefined on 204 No Content', async () => {
		installMock(() => ({ status: 204 }));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		const result = await client.request<void>('DELETE', '/api/thing');
		expect(result).toBeUndefined();
	});

	test('exposes all resource modules', () => {
		// Hand-listing the modules made this test's name a lie — it sat at
		// eleven while `machines`, `dns` and `serviceResourceLinks` were wired
		// onto the client, and asserting `toBeDefined()` on a field TypeScript
		// already requires to be definitely-assigned proves nothing anyway.
		//
		// What is NOT compile-checked is the gap this now covers: a resource
		// module can exist in `src/resources/` and simply never be constructed
		// in the client, which is how it stays invisible to every consumer
		// while looking finished in the tree.
		const client = new HostStack({ apiKey: 'hs_test_x' });
		expect(resourceClassNames(client)).toEqual(resourceModuleClassNames());
	});

	test('client.me() hits GET /api/auth/me', async () => {
		installMock(() => ({
			status: 200,
			body: {
				user: null,
				team: { id: 1, publicId: 'team_main', name: 'Main', slug: 'main', role: 'owner' },
				apiKey: { id: 1, permission: 'full' },
				stripeMode: 'live',
			},
		}));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		const me = await client.me();
		expect(calls[0]!.url).toBe('https://x.io/api/auth/me');
		expect(calls[0]!.method).toBe('GET');
		expect(me.team?.publicId).toBe('team_main');
		expect(me.apiKey?.permission).toBe('full');
	});

	test('sends a hoststack-sdk User-Agent header', async () => {
		installMock(() => ({ status: 200, body: { ok: true } }));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		await client.request('GET', '/api/ping');
		expect(calls[0]!.headers['User-Agent']).toMatch(/^hoststack-sdk\//);
	});

	test('retries on 500 then succeeds, returning the final body', async () => {
		let n = 0;
		installMock(() => {
			n += 1;
			return n === 1
				? { status: 500, body: { error: 'boom' } }
				: { status: 200, body: { ok: true } };
		});
		const client = new HostStack({
			apiKey: 'hs_test_x',
			baseUrl: 'https://x.io',
			maxRetries: 2,
		});
		const result = await client.request<{ ok: boolean }>('GET', '/api/ping');
		expect(result.ok).toBe(true);
		expect(calls).toHaveLength(2);
	});

	test('retries on 429 honoring Retry-After, then throws after budget', async () => {
		// Custom mock to assert Retry-After is parsed; keep the delay tiny.
		globalThis.fetch = (async () => {
			calls.push({ url: 'x', method: 'GET', headers: {}, body: null });
			return new Response(JSON.stringify({ error: 'slow down' }), {
				status: 429,
				headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
			});
		}) as unknown as typeof globalThis.fetch;
		const client = new HostStack({
			apiKey: 'hs_test_x',
			baseUrl: 'https://x.io',
			maxRetries: 1,
		});
		await expect(client.request('GET', '/api/ping')).rejects.toBeInstanceOf(RateLimitError);
		// initial attempt + 1 retry
		expect(calls).toHaveLength(2);
	});

	test('does not retry on 404 (non-retryable)', async () => {
		installMock(() => ({ status: 404, body: { error: 'missing' } }));
		const client = new HostStack({
			apiKey: 'hs_test_x',
			baseUrl: 'https://x.io',
			maxRetries: 3,
		});
		await expect(client.request('GET', '/api/ping')).rejects.toBeInstanceOf(NotFoundError);
		expect(calls).toHaveLength(1);
	});

	test('maxRetries: 0 disables retries on 500', async () => {
		installMock(() => ({ status: 500, body: { error: 'boom' } }));
		const client = new HostStack({
			apiKey: 'hs_test_x',
			baseUrl: 'https://x.io',
			maxRetries: 0,
		});
		await expect(client.request('GET', '/api/ping')).rejects.toBeInstanceOf(HostStackError);
		expect(calls).toHaveLength(1);
	});

	test('does NOT retry a non-idempotent POST on 503 (avoids duplicate side-effect)', async () => {
		installMock(() => ({ status: 503, body: { error: 'unavailable' } }));
		const client = new HostStack({
			apiKey: 'hs_test_x',
			baseUrl: 'https://x.io',
			maxRetries: 3,
		});
		await expect(client.request('POST', '/api/things', { a: 1 })).rejects.toBeInstanceOf(
			HostStackError,
		);
		// One attempt only — a 5xx after a POST may have committed server-side.
		expect(calls).toHaveLength(1);
	});

	test('DOES retry a non-idempotent POST on 429 (rejected before processing)', async () => {
		let n = 0;
		installMock(() => {
			n += 1;
			return n === 1
				? { status: 429, body: { error: 'slow down' } }
				: { status: 200, body: { ok: true } };
		});
		const client = new HostStack({
			apiKey: 'hs_test_x',
			baseUrl: 'https://x.io',
			maxRetries: 2,
		});
		const result = await client.request<{ ok: boolean }>('POST', '/api/things', { a: 1 });
		expect(result.ok).toBe(true);
		expect(calls).toHaveLength(2);
	});

	test('retries an idempotent GET on 503', async () => {
		let n = 0;
		installMock(() => {
			n += 1;
			return n === 1
				? { status: 503, body: { error: 'unavailable' } }
				: { status: 200, body: { ok: true } };
		});
		const client = new HostStack({
			apiKey: 'hs_test_x',
			baseUrl: 'https://x.io',
			maxRetries: 2,
		});
		const result = await client.request<{ ok: boolean }>('GET', '/api/ping');
		expect(result.ok).toBe(true);
		expect(calls).toHaveLength(2);
	});

	test('client.teams.list() hits GET /api/auth/teams', async () => {
		installMock(() => ({
			status: 200,
			body: {
				teams: [
					{ id: 1, publicId: 'team_main', name: 'Main', slug: 'main', role: 'owner' },
				],
			},
		}));
		const client = new HostStack({ apiKey: 'hs_test_x', baseUrl: 'https://x.io' });
		const res = await client.teams.list();
		expect(calls[0]!.url).toBe('https://x.io/api/auth/teams');
		expect(res.teams).toHaveLength(1);
	});
});
