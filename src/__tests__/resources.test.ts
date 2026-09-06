import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { HostStack } from '../client.ts';

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

// All URL-construction assertions use numeric ids so the resolver
// short-circuits and we test only the request shape. The resolver path
// (publicId → numeric via list endpoint) gets its own describe() below.
describe('ProjectsResource', () => {
	test('list hits GET /api/projects/:teamId', async () => {
		await mkClient().projects.list(42);
		expect(calls).toEqual([{ method: 'GET', path: '/api/projects/42', body: undefined }]);
	});

	test('get hits GET /api/projects/:teamId/:projectId', async () => {
		await mkClient().projects.get(42, 7);
		expect(calls[0]).toEqual({ method: 'GET', path: '/api/projects/42/7', body: undefined });
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
		await mkClient().projects.update(42, 7, { name: 'Renamed' });
		expect(calls[0]).toEqual({
			method: 'PATCH',
			path: '/api/projects/42/7',
			body: { name: 'Renamed' },
		});
	});

	test('delete hits DELETE', async () => {
		await mkClient().projects.delete(42, 7);
		expect(calls[0]).toEqual({ method: 'DELETE', path: '/api/projects/42/7', body: undefined });
	});
});

describe('ServicesResource', () => {
	test('list/get/create/update/delete hit expected endpoints', async () => {
		const c = mkClient();
		await c.services.list(1);
		await c.services.get(1, 11);
		await c.services.create(1, {
			name: 'api',
			type: 'web',
			runtime: 'node',
			projectId: 1,
		} as never);
		await c.services.update(1, 11, { name: 'renamed' } as never);
		await c.services.delete(1, 11);
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1',
			'GET /api/services/1/11',
			'POST /api/services/1',
			'PATCH /api/services/1/11',
			'DELETE /api/services/1/11',
		]);
	});

	test('suspend + resume hit the action endpoints', async () => {
		const c = mkClient();
		await c.services.suspend(1, 11);
		await c.services.resume(1, 11);
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'POST /api/services/1/11/suspend',
			'POST /api/services/1/11/resume',
		]);
	});

	test('standalone dev-environment list + create hit the dev-environments routes', async () => {
		const c = mkClient();
		await c.services.listDevEnvironments(1);
		await c.services.createDevEnvironment(1, {
			name: 'my-dev',
			source: { kind: 'blank' },
			databases: ['postgres'],
		});
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/dev-environments/1',
			'POST /api/dev-environments/1',
		]);
	});

	test('getRuntimeLogs builds a query string from options', async () => {
		await mkClient().services.getRuntimeLogs(1, 11, {
			lines: 100,
			since: '2026-01-01T00:00:00Z',
			stream: 'stderr',
		});
		expect(calls[0]!.path).toContain('/runtime-logs?');
		// `lines` is mapped onto the canonical `limit` param the API now
		// accepts (v63 P5 unified the SDK + MCP query naming).
		expect(calls[0]!.path).toContain('limit=100');
		expect(calls[0]!.path).toContain('stream=stderr');
	});

	test('getRuntimeLogs supports search + countOnly', async () => {
		await mkClient().services.getRuntimeLogs(1, 11, {
			limit: 50,
			search: 'OOM',
			since: '-15m',
			countOnly: true,
		});
		expect(calls[0]!.path).toContain('limit=50');
		expect(calls[0]!.path).toContain('search=OOM');
		expect(calls[0]!.path).toContain('since=-15m');
		expect(calls[0]!.path).toContain('count_only=1');
	});
});

describe('DeploysResource', () => {
	test('routes hit the expected endpoints', async () => {
		const c = mkClient();
		await c.deploys.list(1, 11);
		await c.deploys.get(1, 11, 22);
		await c.deploys.trigger(1, 11);
		await c.deploys.cancel(1, 11, 22);
		await c.deploys.rollback(1, 11, 22);
		await c.deploys.getLogs(1, 11, 22);
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1/11/deploys',
			'GET /api/services/1/11/deploys/22',
			'POST /api/services/1/11/deploys',
			'POST /api/services/1/11/deploys/22/cancel',
			'POST /api/services/1/11/deploys/22/rollback',
			'GET /api/services/1/11/deploys/22/logs',
		]);
	});

	test('trigger with no args sends an empty body', async () => {
		await mkClient().deploys.trigger(1, 11);
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
		await c.databases.getCredentials(1, 5);
		await c.databases.resetPassword(1, 5);
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/databases/1/5/credentials',
			'POST /api/databases/1/5/reset-password',
		]);
	});
});

describe('DomainsResource', () => {
	test('list/add/update/remove/verify hit expected endpoints', async () => {
		const c = mkClient();
		await c.domains.list(1);
		await c.domains.add(1, { domain: 'foo.com', serviceId: 1 } as never);
		await c.domains.update(1, 9, { primary: true } as never);
		await c.domains.remove(1, 9);
		await c.domains.verify(1, 9);
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/domains/1',
			'POST /api/domains/1',
			'PATCH /api/domains/1/9',
			'DELETE /api/domains/1/9',
			'POST /api/domains/1/9/verify',
		]);
	});
});

describe('EnvVarsResource', () => {
	test('list/create/update/delete/bulkSet hit expected endpoints', async () => {
		const c = mkClient();
		await c.envVars.list(1, 11);
		await c.envVars.create(1, 11, { key: 'A', value: '1' });
		await c.envVars.update(1, 11, 33, { value: '2' });
		await c.envVars.delete(1, 11, 33);
		await c.envVars.bulkSet(1, 11, { vars: [] });
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1/11/env',
			'POST /api/services/1/11/env',
			'PATCH /api/services/1/11/env/33',
			'DELETE /api/services/1/11/env/33',
			'PUT /api/services/1/11/env/bulk',
		]);
	});
});

describe('CronResource', () => {
	test('list with limit encodes the query string', async () => {
		await mkClient().cron.list(1, 11, { limit: 50 });
		expect(calls[0]!.path).toBe('/api/services/1/11/cron-executions?limit=50');
	});

	test('list without options has no query string', async () => {
		await mkClient().cron.list(1, 11);
		expect(calls[0]!.path).toBe('/api/services/1/11/cron-executions');
	});

	test('trigger + get hit the expected endpoints', async () => {
		const c = mkClient();
		await c.cron.get(1, 11, 77);
		await c.cron.trigger(1, 11);
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1/11/cron-executions/77',
			'POST /api/services/1/11/cron-executions/trigger',
		]);
	});
});

// Machines and resource links are the two newest resources on the published
// client and were the two with no request-shape test at all. Both are also the
// two whose paths are easiest to get wrong from the outside: machines mount at
// their own top-level prefix, and the managed-resource catalogue mounts under
// /api/teams rather than a prefix named after itself.
describe('MachinesResource', () => {
	test('list/get hit the /api/machines prefix', async () => {
		const c = mkClient();
		await c.machines.list(1);
		await c.machines.get(1, 5);
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			'GET /api/machines/1',
			'GET /api/machines/1/5',
		]);
	});
});

describe('ServiceResourceLinksResource', () => {
	test('the managed-resource catalogue lives under /api/teams, not its own prefix', async () => {
		await mkClient().serviceResourceLinks.listManagedResources(1);
		expect(calls[0]).toEqual({
			method: 'GET',
			path: '/api/teams/1/resources',
			body: undefined,
		});
	});

	test('list/create/updateAlias/delete hit the service-scoped endpoints', async () => {
		const c = mkClient();
		await c.serviceResourceLinks.list(1, 11);
		await c.serviceResourceLinks.create(1, 11, {
			resourceType: 'database',
			resourceId: 3,
			alias: 'APP_DB',
		});
		await c.serviceResourceLinks.updateAlias(1, 11, 9, 'CATALOG');
		await c.serviceResourceLinks.delete(1, 11, 9);
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			'GET /api/services/1/11/resources',
			'POST /api/services/1/11/resources',
			'PATCH /api/services/1/11/resources/9',
			'DELETE /api/services/1/11/resources/9',
		]);
	});

	test('create sends the link body verbatim and updateAlias wraps the bare alias', async () => {
		const c = mkClient();
		await c.serviceResourceLinks.create(1, 11, {
			resourceType: 'search',
			resourceId: 4,
			alias: 'CATALOG',
		});
		await c.serviceResourceLinks.updateAlias(1, 11, 9, 'CATALOG');
		expect(calls.map((call) => call.body)).toEqual([
			{ resourceType: 'search', resourceId: 4, alias: 'CATALOG' },
			{ alias: 'CATALOG' },
		]);
	});

	test('a svc_ publicId is resolved before the link call', async () => {
		responder = (path) =>
			path === '/api/services/1' ? { services: [{ id: 11, publicId: 'svc_abc123' }] } : {};
		await mkClient().serviceResourceLinks.list(1, 'svc_abc123');
		expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
			'GET /api/services/1',
			'GET /api/services/1/11/resources',
		]);
	});
});

describe('publicId resolution', () => {
	test('numeric-string ids short-circuit the resolver (no list call)', async () => {
		await mkClient().deploys.trigger('1', '11');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'POST /api/services/1/11/deploys',
		]);
	});

	test('svc_ publicId is resolved via the list endpoint then used numerically', async () => {
		responder = (path) => {
			if (path === '/api/services/1') {
				return { services: [{ id: 11, publicId: 'svc_abc123' }] };
			}
			return {};
		};
		await mkClient().deploys.trigger(1, 'svc_abc123');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1', // resolver list
			'POST /api/services/1/11/deploys', // numeric id used
		]);
	});

	test('resolved publicId is cached on the client (no second list call)', async () => {
		responder = (path) => {
			if (path === '/api/services/1') {
				return { services: [{ id: 11, publicId: 'svc_abc123' }] };
			}
			return {};
		};
		const c = mkClient();
		await c.deploys.trigger(1, 'svc_abc123');
		await c.deploys.list(1, 'svc_abc123');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1', // single list call
			'POST /api/services/1/11/deploys',
			'GET /api/services/1/11/deploys', // cached, no second resolution
		]);
	});

	test('dpl_ publicId resolves via /deploys list scoped to the service', async () => {
		// Deploys list is paginated and returns `{ data, ... }` — not the bare
		// `{ deploys: [] }` shape the other endpoints use.
		responder = (path) => {
			if (path.startsWith('/api/services/1/11/deploys')) {
				return {
					data: [{ id: 22, publicId: 'dpl_xyz789' }],
					page: 1,
					perPage: 100,
					total: 1,
					totalPages: 1,
				};
			}
			return {};
		};
		await mkClient().deploys.cancel(1, 11, 'dpl_xyz789');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1/11/deploys?perPage=100',
			'POST /api/services/1/11/deploys/22/cancel',
		]);
	});

	test('a dev-box svc_ publicId missing from the service list falls back to the dev-env list', async () => {
		// Dev environments are filtered out of /api/services/:team, so a dev box
		// publicId misses there and must resolve via /api/dev-environments/:team.
		responder = (path) => {
			if (path === '/api/services/1') return { services: [] };
			if (path === '/api/dev-environments/1') {
				return { environments: [{ id: 25, publicId: 'svc_devbox' }] };
			}
			return {};
		};
		await mkClient().services.resize(1, 'svc_devbox', 'large');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1', // regular list — misses
			'GET /api/dev-environments/1', // fallback — hits
			'PATCH /api/services/1/25', // resolved numeric id used
		]);
	});

	test('the dev-env fallback only fires on a miss (regular services skip it)', async () => {
		responder = (path) => {
			if (path === '/api/services/1') {
				return { services: [{ id: 11, publicId: 'svc_regular' }] };
			}
			return {};
		};
		await mkClient().services.resize(1, 'svc_regular', 'standard');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/services/1', // found here — no dev-env fetch
			'PATCH /api/services/1/11',
		]);
	});

	test('resize() PATCHes the service with the new plan', async () => {
		await mkClient().services.resize(1, 11, 'large');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['PATCH /api/services/1/11']);
		expect(calls[0]!.body).toEqual({ plan: 'large' });
	});

	test('team_ publicId resolves via /api/teams', async () => {
		responder = (path) => {
			if (path === '/api/teams') {
				return { teams: [{ id: 1, publicId: 'team_main' }] };
			}
			return {};
		};
		await mkClient().services.list('team_main');
		expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/teams',
			'GET /api/services/1',
		]);
	});

	test('publicId not in the list throws NotFoundError', async () => {
		responder = (path) => (path === '/api/services/1' ? { services: [] } : {});
		await expect(mkClient().deploys.trigger(1, 'svc_missing')).rejects.toMatchObject({
			statusCode: 404,
		});
	});

	test('wrong-prefix string throws a 400', async () => {
		await expect(mkClient().deploys.trigger(1, 'dpl_wrong')).rejects.toMatchObject({
			statusCode: 400,
		});
	});
});
