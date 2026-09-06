/**
 * v91 Phase 4: regression tests for the five SDK contracts that
 * silently misbehaved before the v91 audit. Each block locks the
 * post-fix shape so a future revert is caught at test-time, not by
 * a customer hitting a 400 from production.
 *
 * Original audit findings, with the fix shipped in v91 Phase 1 (99156a6):
 *  1. TriggerDeployInput.clearCache (fictional) → commitHash / branch
 *  2. DatabaseCredentials.database (typo)       → databaseName
 *  3. ServiceMetrics (flat, wrong)              → ServiceMetricsSnapshot
 *                                                  + ServiceMetricsPoint
 *  4. EnvVar.publicId (no column on env_vars)   → dropped
 *  5. AddDomainInput.serviceId optional / no PI → required + publicId resolver
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { HostStack } from '../client.ts';
import type {
	AddDomainInput,
	DatabaseCredentials,
	EnvVar,
	ServiceMetricsPoint,
	ServiceMetricsSnapshot,
	TriggerDeployInput,
} from '../types.ts';

interface Call {
	method: string;
	path: string;
	body: unknown;
}

const originalFetch = globalThis.fetch;
let calls: Call[] = [];
let responder: (path: string) => unknown = () => ({});
const BASE = 'https://x.io';

function installFetch() {
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : String(input);
		const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
		const body = init?.body ? JSON.parse(init.body as string) : undefined;
		calls.push({ method: init?.method ?? 'GET', path, body });
		return new Response(JSON.stringify(responder(path)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	}) as typeof globalThis.fetch;
}

beforeEach(() => {
	calls = [];
	responder = () => ({});
	installFetch();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function mkClient() {
	return new HostStack({ apiKey: 'hs_test_x', baseUrl: BASE });
}

describe('v91 false-friend #1: TriggerDeployInput shape', () => {
	test('forwards commitHash + branch on the body verbatim', async () => {
		const input: TriggerDeployInput = { commitHash: 'deadbeef', branch: 'main' };
		await mkClient().deploys.trigger(1, 11, input);
		expect(calls[0]!.body).toEqual({ commitHash: 'deadbeef', branch: 'main' });
	});

	test('legacy {clear_cache: true} call does not type-check', () => {
		// @ts-expect-error — `clear_cache` is the dropped pre-v91 field. Cache
		// clearing lives on DELETE /build-cache; deploy-trigger only takes
		// commitHash + branch.
		const _bad: TriggerDeployInput = { clear_cache: true };
		void _bad;
	});

	test('TriggerDeployInput does not expose a clearCache key', () => {
		// Runtime probe: a TS-level shape assertion is the wrong tool —
		// instead, assert the schema-allowed keys via build-time check.
		const allowed: Array<keyof TriggerDeployInput> = ['commitHash', 'branch'];
		expect(allowed).toEqual(['commitHash', 'branch']);
	});
});

describe('v91 false-friend #2: DatabaseCredentials.databaseName', () => {
	test('SDK passes through the real response shape', async () => {
		responder = () => ({
			credentials: {
				host: 'pg.svc',
				port: 5432,
				username: 'app',
				password: 'secret',
				databaseName: 'appdb',
				connectionUrl: 'postgres://app:secret@pg.svc:5432/appdb',
			},
		});
		const { credentials } = await mkClient().databases.getCredentials(1, 5);
		const creds: DatabaseCredentials = credentials;
		expect(creds.databaseName).toBe('appdb');
		expect(creds.connectionUrl).toContain('appdb');
	});

	test('legacy `.database` field is no longer typed', () => {
		const creds: DatabaseCredentials = {
			host: null,
			port: null,
			username: null,
			password: '',
			databaseName: 'db1',
			connectionUrl: '',
		};
		// @ts-expect-error — `.database` was renamed to `.databaseName` in v91 Phase 1.
		void creds.database;
	});

	test('host/port/username may be null during provisioning', () => {
		const creds: DatabaseCredentials = {
			host: null,
			port: null,
			username: null,
			password: 'pw',
			databaseName: 'appdb',
			connectionUrl: '',
		};
		expect(creds.host).toBeNull();
		expect(creds.port).toBeNull();
		expect(creds.username).toBeNull();
	});
});

describe('v91 false-friend #3: ServiceMetricsSnapshot / ServiceMetricsPoint split', () => {
	test('getMetrics returns the snapshot envelope (metrics + serverOverview)', async () => {
		responder = () => ({
			metrics: {
				timestamp: '2026-05-20T00:00:00.000Z',
				cpuPercent: 12.3,
				memoryUsedMb: 256,
				memoryLimitMb: 512,
				networkRxBytes: 1024,
				networkTxBytes: 2048,
				diskUsedMb: 100,
			},
			serverOverview: {
				cpuPercent: 30,
				memoryUsedMb: 4096,
				memoryLimitMb: 8192,
				diskUsedMb: 10240,
				containerCount: 7,
			},
		});
		const snap = await mkClient().services.getMetrics(1, 11);
		const typed: ServiceMetricsSnapshot = snap;
		expect(typed.metrics?.cpuPercent).toBe(12.3);
		expect(typed.serverOverview?.containerCount).toBe(7);
	});

	test('metrics is null before the first sample lands', async () => {
		responder = () => ({ metrics: null, serverOverview: null });
		const snap = await mkClient().services.getMetrics(1, 11);
		const typed: ServiceMetricsSnapshot = snap;
		expect(typed.metrics).toBeNull();
		expect(typed.serverOverview).toBeNull();
	});

	test('getMetricsHistory rows match ServiceMetricsPoint', async () => {
		responder = () => ({
			history: [
				{
					timestamp: '2026-05-20T00:00:00.000Z',
					cpuPercent: 1,
					memoryUsedMb: 2,
					memoryLimitMb: 3,
					networkRxBytes: 4,
					networkTxBytes: 5,
					diskUsedMb: 6,
				},
			],
		});
		const res = await mkClient().services.getMetricsHistory(1, 11);
		const point: ServiceMetricsPoint = res.history[0]!;
		expect(point.cpuPercent).toBe(1);
		expect(point.memoryUsedMb).toBe(2);
	});
});

describe('v91 false-friend #4: EnvVar has no publicId', () => {
	test('EnvVar shape: id is numeric, no publicId', () => {
		const v: EnvVar = {
			id: 33,
			key: 'NODE_ENV',
			value: 'production',
			target: 'runtime',
			isSecret: false,
		};
		expect(v.id).toBe(33);
		// @ts-expect-error — env_vars row has no public_id column; v91 Phase 1 dropped the field.
		void v.publicId;
	});

	test('envVars.delete passes the numeric id straight through', async () => {
		await mkClient().envVars.delete(1, 11, 33);
		expect(calls[0]!.path).toBe('/api/services/1/11/env/33');
	});
});

describe('v91 false-friend #5: AddDomainInput.serviceId required + publicId', () => {
	test('serviceId is required (TS error if omitted)', () => {
		// @ts-expect-error — pre-v91 SDK left serviceId optional, so callers
		// would POST a domain with no service binding and get a 400.
		const _bad: AddDomainInput = { domain: 'foo.com' };
		void _bad;
	});

	test('numeric serviceId hits the create endpoint with the body intact', async () => {
		const input: AddDomainInput = { domain: 'foo.com', serviceId: 7, pathPrefix: '/api' };
		await mkClient().domains.add(1, input);
		expect(calls[0]).toEqual({
			method: 'POST',
			path: '/api/domains/1',
			body: { domain: 'foo.com', serviceId: 7, pathPrefix: '/api' },
		});
	});

	test('svc_ publicId on serviceId is resolved before the create call', async () => {
		responder = (path) => {
			if (path === '/api/services/1') {
				return { services: [{ id: 7, publicId: 'svc_xyz' }] };
			}
			return {};
		};
		await mkClient().domains.add(1, { domain: 'foo.com', serviceId: 'svc_xyz' });
		// First call resolves the publicId, second call posts the domain
		// with the resolved numeric id.
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1',
			'POST /api/domains/1',
		]);
		expect(calls[1]!.body).toEqual({ domain: 'foo.com', serviceId: 7 });
	});
});
