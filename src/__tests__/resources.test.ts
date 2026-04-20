import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { HostStack } from '../client.ts';

interface Call {
	method: string;
	path: string;
	body: unknown;
}

const originalFetch = globalThis.fetch;
let calls: Call[] = [];
const BASE = 'https://x.io';

function installFetch() {
	globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = typeof input === 'string' ? input : String(input);
		const path = url.startsWith(BASE) ? url.slice(BASE.length) : url;
		const body = init?.body ? JSON.parse(init.body as string) : undefined;
		calls.push({ method: init?.method ?? 'GET', path, body });
		// Return a generic response object that the resource method unwraps.
		return new Response(JSON.stringify({}), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	}) as typeof globalThis.fetch;
}

beforeEach(() => {
	calls = [];
	installFetch();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function mkClient() {
	return new HostStack({ apiKey: 'hs_test_x', baseUrl: BASE });
}

describe('ProjectsResource', () => {
	test('list hits GET /api/projects/:teamId', async () => {
		await mkClient().projects.list(42);
		expect(calls).toEqual([{ method: 'GET', path: '/api/projects/42', body: undefined }]);
	});

	test('get hits GET /api/projects/:teamId/:projectId', async () => {
		await mkClient().projects.get(42, 'prj_abc');
		expect(calls[0]).toEqual({ method: 'GET', path: '/api/projects/42/prj_abc', body: undefined });
	});

	test('create hits POST with body', async () => {
		await mkClient().projects.create(42, { name: 'Billing' });
		expect(calls[0]).toEqual({
			method: 'POST',
			path: '/api/projects/42',
			body: { name: 'Billing' },
		});
	});

	test('update hits PATCH with body', async () => {
		await mkClient().projects.update(42, 'prj_abc', { name: 'Renamed' });
		expect(calls[0]).toEqual({
			method: 'PATCH',
			path: '/api/projects/42/prj_abc',
			body: { name: 'Renamed' },
		});
	});

	test('delete hits DELETE', async () => {
		await mkClient().projects.delete(42, 'prj_abc');
		expect(calls[0]).toEqual({ method: 'DELETE', path: '/api/projects/42/prj_abc', body: undefined });
	});
});

describe('ServicesResource', () => {
	test('list/get/create/update/delete hit expected endpoints', async () => {
		const c = mkClient();
		await c.services.list(1);
		await c.services.get(1, 'svc_1');
		await c.services.create(1, { name: 'api', type: 'web', runtime: 'node', projectId: 1 } as never);
		await c.services.update(1, 'svc_1', { name: 'renamed' } as never);
		await c.services.delete(1, 'svc_1');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1',
			'GET /api/services/1/svc_1',
			'POST /api/services/1',
			'PATCH /api/services/1/svc_1',
			'DELETE /api/services/1/svc_1',
		]);
	});

	test('suspend + resume hit the action endpoints', async () => {
		const c = mkClient();
		await c.services.suspend(1, 'svc_1');
		await c.services.resume(1, 'svc_1');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'POST /api/services/1/svc_1/suspend',
			'POST /api/services/1/svc_1/resume',
		]);
	});

	test('getRuntimeLogs builds a query string from options', async () => {
		await mkClient().services.getRuntimeLogs(1, 'svc_1', {
			lines: 100,
			since: '2026-01-01T00:00:00Z',
			stream: 'stderr',
		});
		expect(calls[0]!.path).toContain('/runtime-logs?');
		expect(calls[0]!.path).toContain('lines=100');
		expect(calls[0]!.path).toContain('stream=stderr');
	});
});

describe('DeploysResource', () => {
	test('routes hit the expected endpoints', async () => {
		const c = mkClient();
		await c.deploys.list(1, 'svc_1');
		await c.deploys.get(1, 'svc_1', 'dpl_1');
		await c.deploys.trigger(1, 'svc_1');
		await c.deploys.cancel(1, 'svc_1', 'dpl_1');
		await c.deploys.rollback(1, 'svc_1', 'dpl_1');
		await c.deploys.getLogs(1, 'svc_1', 'dpl_1');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1/svc_1/deploys',
			'GET /api/services/1/svc_1/deploys/dpl_1',
			'POST /api/services/1/svc_1/deploys',
			'POST /api/services/1/svc_1/deploys/dpl_1/cancel',
			'POST /api/services/1/svc_1/deploys/dpl_1/rollback',
			'GET /api/services/1/svc_1/deploys/dpl_1/logs',
		]);
	});

	test('trigger with no args sends an empty body', async () => {
		await mkClient().deploys.trigger(1, 'svc_1');
		expect(calls[0]!.body).toEqual({});
	});
});

describe('DatabasesResource', () => {
	test('list passes projectId as a query param', async () => {
		await mkClient().databases.list(1, 7);
		expect(calls[0]!.path).toBe('/api/databases/1?projectId=7');
	});

	test('credentials + resetPassword hit the right endpoints', async () => {
		const c = mkClient();
		await c.databases.getCredentials(1, 'db_1');
		await c.databases.resetPassword(1, 'db_1');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/databases/1/db_1/credentials',
			'POST /api/databases/1/db_1/reset-password',
		]);
	});
});

describe('DomainsResource', () => {
	test('list/add/update/remove/verify hit expected endpoints', async () => {
		const c = mkClient();
		await c.domains.list(1);
		await c.domains.add(1, { domain: 'foo.com', serviceId: 1 } as never);
		await c.domains.update(1, 'dom_1', { primary: true } as never);
		await c.domains.remove(1, 'dom_1');
		await c.domains.verify(1, 'dom_1');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/domains/1',
			'POST /api/domains/1',
			'PATCH /api/domains/1/dom_1',
			'DELETE /api/domains/1/dom_1',
			'POST /api/domains/1/dom_1/verify',
		]);
	});
});

describe('EnvVarsResource', () => {
	test('list/create/update/delete/bulkSet hit expected endpoints', async () => {
		const c = mkClient();
		await c.envVars.list(1, 'svc_1');
		await c.envVars.create(1, 'svc_1', { key: 'A', value: '1' } as never);
		await c.envVars.update(1, 'svc_1', 'env_1', { value: '2' } as never);
		await c.envVars.delete(1, 'svc_1', 'env_1');
		await c.envVars.bulkSet(1, 'svc_1', { envVars: [] } as never);
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1/svc_1/env',
			'POST /api/services/1/svc_1/env',
			'PATCH /api/services/1/svc_1/env/env_1',
			'DELETE /api/services/1/svc_1/env/env_1',
			'PUT /api/services/1/svc_1/env/bulk',
		]);
	});
});

describe('CronResource', () => {
	test('list with limit encodes the query string', async () => {
		await mkClient().cron.list(1, 'svc_1', { limit: 50 });
		expect(calls[0]!.path).toBe('/api/services/1/svc_1/cron-executions?limit=50');
	});

	test('list without options has no query string', async () => {
		await mkClient().cron.list(1, 'svc_1');
		expect(calls[0]!.path).toBe('/api/services/1/svc_1/cron-executions');
	});

	test('trigger + get hit the expected endpoints', async () => {
		const c = mkClient();
		await c.cron.get(1, 'svc_1', 'exec_1');
		await c.cron.trigger(1, 'svc_1');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1/svc_1/cron-executions/exec_1',
			'POST /api/services/1/svc_1/cron-executions/trigger',
		]);
	});
});
