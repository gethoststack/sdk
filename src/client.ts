import {
	AuthenticationError,
	ConflictError,
	ForbiddenError,
	HostStackError,
	NotFoundError,
	RateLimitError,
} from './errors.ts';
import { CronResource } from './resources/cron.ts';
import { DatabasesResource } from './resources/databases.ts';
import { DeploysResource } from './resources/deploys.ts';
import { DevTasksResource } from './resources/dev-tasks.ts';
import { DomainsResource } from './resources/domains.ts';
import { EnvironmentsResource } from './resources/environments.ts';
import { AnalyticsResource } from './resources/analytics.ts';
import { ErrorsResource } from './resources/errors.ts';
import { EnvVarsResource } from './resources/env-vars.ts';
import { NotificationsResource } from './resources/notifications.ts';
import { ProjectsResource } from './resources/projects.ts';
import { ServiceResourceLinksResource } from './resources/service-resource-links.ts';
import { ServicesResource } from './resources/services.ts';
import { TeamsResource } from './resources/teams.ts';
import { UptimeResource } from './resources/uptime.ts';
import { MachinesResource } from './resources/machines.ts';
import { VolumesResource } from './resources/volumes.ts';
import { DnsResource } from './resources/dns.ts';
import type { MeResponse } from './types.ts';
import { USER_AGENT } from './version.ts';

/** A numeric id or a publicId string (e.g. 42, "42", "svc_abc…"). */
export type IdInput = number | string;

/** Default per-request timeout (ms) before the request is aborted. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** Default number of automatic retries on 429 / 5xx / network errors. */
const DEFAULT_MAX_RETRIES = 2;
/** Cap on the back-off delay we'll honor from a `Retry-After` header (ms). */
const MAX_RETRY_AFTER_MS = 60_000;

export interface HostStackOptions {
	/** Your HostStack API key (hs_live_... or hs_test_...). */
	apiKey: string;
	/** Base URL of the HostStack API. Defaults to https://hoststack.dev */
	baseUrl?: string;
	/**
	 * Per-request timeout in milliseconds before the request is aborted with a
	 * `HostStackError` (status 0). Defaults to 30000 (30s). Set to 0 to disable.
	 */
	timeoutMs?: number;
	/**
	 * Number of automatic retries on retryable failures (HTTP 429, any 5xx, and
	 * network/timeout errors). Retries use exponential back-off and honor a
	 * `Retry-After` header when present. Defaults to 2. Set to 0 to disable.
	 */
	maxRetries?: number;
	/**
	 * Override the `User-Agent` header sent on every request. Defaults to
	 * `hoststack-sdk/<version>`. Wrappers (CLI, MCP) set this to identify
	 * themselves (e.g. `hoststack-cli/0.8.0`) so the API can attribute traffic.
	 */
	userAgent?: string;
}

const PREFIX = {
	team: 'team_',
	project: 'prj_',
	service: 'svc_',
	deploy: 'dpl_',
	database: 'db_',
	domain: 'dom_',
	volume: 'vol_',
	environment: 'env_',
	cronExecution: 'cjob_',
	devTask: 'task_',
} as const;

type ResolveScope =
	| { kind: 'team' }
	| { kind: 'project'; teamId: number }
	| { kind: 'service'; teamId: number }
	| { kind: 'deploy'; teamId: number; serviceId: number }
	| { kind: 'database'; teamId: number }
	| { kind: 'domain'; teamId: number }
	| { kind: 'volume'; teamId: number; serviceId: number }
	// v66 P5: env publicIds resolve numeric ids by hitting the project's
	// env list. The resource methods that call resolveId for env scope
	// only need teamId since the listForProject endpoint validates team
	// ownership; we accept publicId from any project the team owns.
	| { kind: 'environment'; teamId: number }
	| { kind: 'cronExecution'; teamId: number; serviceId: number }
	| { kind: 'devTask'; teamId: number };

export class HostStack {
	private apiKey: string;
	private baseUrl: string;
	private timeoutMs: number;
	private maxRetries: number;
	private userAgent: string;

	// publicId → numeric id, scoped by parent context. Lifetime: client instance.
	private idCache = new Map<string, number>();

	/** Manage projects. */
	public readonly projects: ProjectsResource;
	/** Manage services (web, worker, cron). */
	public readonly services: ServicesResource;
	/** Trigger and manage deployments. */
	public readonly deploys: DeploysResource;
	/** Manage databases (Postgres, Redis). */
	public readonly databases: DatabasesResource;
	/** Manage custom domains. */
	public readonly domains: DomainsResource;
	/** Manage service environment variables. */
	public readonly envVars: EnvVarsResource;
	/** v66: manage environments (production/staging/development/preview) per project. */
	public readonly environments: EnvironmentsResource;
	/** Manage cron job executions. */
	public readonly cron: CronResource;
	/** Manage persistent disks attached to services. */
	public readonly volumes: VolumesResource;
	public readonly devTasks: DevTasksResource;
	/** The team's own enrolled machines — read them to place work on one. */
	public readonly machines: MachinesResource;
	/**
	 * Manage notification channels — Slack/Discord webhooks + email
	 * recipients with per-channel event filters. Used for deploy
	 * failures, restart loops, ACME failures, git auth losses, etc.
	 */
	public readonly notifications: NotificationsResource;
	/**
	 * Error tracking — exceptions your application reported, grouped by cause,
	 * and the write-only ingest keys applications use to report them.
	 */
	public readonly analytics: AnalyticsResource;
	public readonly errors: ErrorsResource;
	/**
	 * Uptime checks — HostStack requesting a service's public URL on a
	 * schedule and alerting when it stops answering.
	 */
	public readonly uptime: UptimeResource;
	/** List the teams this API key (or session) can access. */
	public readonly teams: TeamsResource;
	/** Manage authoritative DNS zones and their records (PowerDNS-backed). */
	public readonly dns: DnsResource;
	/**
	 * Bind managed resources (databases, object storage, queues, search,
	 * email domains) to a service. This is what makes `DATABASE_URL` and
	 * friends appear in the container's environment on the next deploy.
	 */
	public readonly serviceResourceLinks: ServiceResourceLinksResource;

	constructor(options: HostStackOptions) {
		if (!options.apiKey) {
			throw new Error('apiKey is required');
		}

		this.apiKey = options.apiKey;
		this.baseUrl = (options.baseUrl ?? 'https://hoststack.dev').replace(/\/$/, '');
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
		this.userAgent = options.userAgent ?? USER_AGENT;

		// The API key is sent as a Bearer token on every request. Warn loudly if
		// it would be transmitted in cleartext to a non-localhost host — a
		// poisoned env var or a mistyped `--url` would otherwise exfiltrate a
		// live key silently. Allow http only for localhost development.
		try {
			const u = new URL(this.baseUrl);
			const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
			if (u.protocol !== 'https:' && !isLocalhost) {
				console.warn(
					`[hoststack] WARNING: sending your API key over an insecure (${u.protocol}//) connection to ${u.host}. Use https:// to avoid leaking the key.`,
				);
			}
		} catch {
			throw new Error(`Invalid baseUrl: ${JSON.stringify(this.baseUrl)}`);
		}

		this.projects = new ProjectsResource(this);
		this.services = new ServicesResource(this);
		this.deploys = new DeploysResource(this);
		this.databases = new DatabasesResource(this);
		this.domains = new DomainsResource(this);
		this.envVars = new EnvVarsResource(this);
		this.environments = new EnvironmentsResource(this);
		this.cron = new CronResource(this);
		this.volumes = new VolumesResource(this);
		this.devTasks = new DevTasksResource(this);
		this.machines = new MachinesResource(this);
		this.notifications = new NotificationsResource(this);
		this.analytics = new AnalyticsResource(this);
		this.errors = new ErrorsResource(this);
		this.uptime = new UptimeResource(this);
		this.teams = new TeamsResource(this);
		this.dns = new DnsResource(this);
		this.serviceResourceLinks = new ServiceResourceLinksResource(this);
	}

	/**
	 * Identify the authenticated principal. For API-key auth, `user` is
	 * `null` and `team` is the team the key is bound to; `apiKey` carries
	 * the key's permission scope (read or full).
	 */
	async me(): Promise<MeResponse> {
		return this.request<MeResponse>('GET', '/api/auth/me');
	}

	/**
	 * Make an authenticated request to the HostStack API.
	 * Used internally by resource classes. Can also be used for custom API calls.
	 */
	async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const url = `${this.baseUrl}${path}`;

		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiKey}`,
			'User-Agent': this.userAgent,
		};

		if (body !== undefined) {
			headers['Content-Type'] = 'application/json';
		}

		const init: RequestInit = {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		};

		// Retry policy is method-aware to avoid duplicating side-effects:
		//  - GET/HEAD (idempotent): retry on 429, any 5xx, and network/timeout.
		//  - POST/PUT/PATCH/DELETE: retry ONLY on 429 (the request was rejected
		//    before processing, so re-sending is safe). A 5xx or a dropped
		//    connection may mean the server already committed the mutation, so
		//    retrying could create a duplicate (e.g. a second deploy or resource).
		// `lastError` is rethrown once the budget is exhausted.
		const idempotent = method === 'GET' || method === 'HEAD';
		let lastError: unknown;
		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			let res: Response;
			try {
				res = await this.doFetch(url, init);
			} catch (err: unknown) {
				// Network failure or timeout abort. Only retry idempotent methods:
				// a non-idempotent request may have already reached and mutated
				// the server before the connection dropped.
				lastError = this.asTransportError(err);
				if (idempotent && attempt < this.maxRetries) {
					await delay(backoffMs(attempt));
					continue;
				}
				throw lastError;
			}

			if (res.ok) {
				// Handle 204 No Content
				if (res.status === 204) return undefined as T;
				return res.json() as Promise<T>;
			}

			const data = (await res.json().catch(() => ({ error: 'Unknown error' }))) as {
				error?: string;
			};
			const message = data.error ?? `HTTP ${res.status}`;

			// 429 (rate-limited → rejected before processing) is safe to retry for
			// any method; 5xx is only retried for idempotent methods (a mutating
			// request may have already committed server-side). Respect
			// `Retry-After` (delta-seconds) when present, capped, else back off.
			const retryAfterSec = parseRetryAfter(res.headers.get('Retry-After'));
			const retryableStatus = res.status === 429 || (idempotent && res.status >= 500);
			if (retryableStatus && attempt < this.maxRetries) {
				const waitMs =
					retryAfterSec !== undefined
						? Math.min(retryAfterSec * 1000, MAX_RETRY_AFTER_MS)
						: backoffMs(attempt);
				await delay(waitMs);
				lastError = this.toApiError(res.status, message, data, retryAfterSec);
				continue;
			}

			throw this.toApiError(res.status, message, data, retryAfterSec);
		}

		// Unreachable in practice — the loop always returns or throws — but keeps
		// the type checker happy and surfaces the last error if it ever happens.
		throw lastError ?? new HostStackError(0, 'Request failed');
	}

	/** Run a single fetch with the configured timeout (if any). */
	private async doFetch(url: string, init: RequestInit): Promise<Response> {
		if (this.timeoutMs <= 0) {
			return fetch(url, init);
		}
		// AbortSignal.timeout aborts the request after `timeoutMs`; the rejected
		// promise is caught by the retry loop and treated as a transport error.
		return fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
	}

	/** Map a thrown fetch/abort error to a typed HostStackError. */
	private asTransportError(err: unknown): HostStackError {
		if (err instanceof HostStackError) return err;
		const isTimeout =
			err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
		const message = isTimeout
			? `Request timed out after ${this.timeoutMs}ms`
			: err instanceof Error
				? err.message
				: 'Network request failed';
		return new HostStackError(0, message, err);
	}

	/** Construct the specific HostStackError subclass for a non-OK status. */
	private toApiError(
		status: number,
		message: string,
		data: unknown,
		retryAfterSec: number | undefined,
	): HostStackError {
		switch (status) {
			case 401:
				return new AuthenticationError(message, data);
			case 403:
				return new ForbiddenError(message, data);
			case 404:
				return new NotFoundError(message, data);
			case 409:
				return new ConflictError(message, data);
			case 429:
				return new RateLimitError(message, retryAfterSec, data);
			default:
				return new HostStackError(status, message, data);
		}
	}

	/**
	 * Resolve a publicId-or-numeric id input to a numeric database id. Numeric
	 * inputs short-circuit; publicIds (svc_xyz, dpl_xyz, etc.) are looked up
	 * via the relevant list endpoint and cached on this client instance.
	 *
	 * The API addresses everything by numeric id internally; this resolver lets
	 * SDK/MCP consumers pass either form interchangeably without burning extra
	 * round-trips on subsequent calls.
	 */
	async resolveId(input: IdInput, scope: ResolveScope): Promise<number> {
		if (typeof input === 'number') return input;
		if (/^\d+$/.test(input)) return Number.parseInt(input, 10);

		const expectedPrefix = PREFIX[scope.kind];
		if (!input.startsWith(expectedPrefix)) {
			throw new HostStackError(
				400,
				`Invalid ${scope.kind} id "${input}": expected ${expectedPrefix}xxx or numeric.`,
			);
		}

		const cacheKey = `${cacheScope(scope)}:${input}`;
		const cached = this.idCache.get(cacheKey);
		if (cached !== undefined) return cached;

		const items = await this.fetchForResolution(scope);
		let match = items.find((it) => it.publicId === input);
		if (!match && scope.kind === 'service') {
			// Dev environments are private_service boxes that the regular service
			// list filters OUT, so a dev box's `svc_…` publicId misses above —
			// which previously broke get/update/config/resize for every dev box.
			// Fall back to the dev-env list, but ONLY on a miss, so normal
			// service resolution stays a single round-trip. Best-effort: a
			// failure here just falls through to the NotFound below.
			try {
				const d = await this.request<{
					environments: Array<{ id: number; publicId: string }>;
				}>('GET', `/api/dev-environments/${scope.teamId}`);
				match = (d.environments ?? []).find((it) => it.publicId === input);
			} catch {
				// ignore — handled by the NotFound below
			}
		}
		if (!match) {
			throw new NotFoundError(`${scope.kind} ${input} not found`);
		}
		this.idCache.set(cacheKey, match.id);
		return match.id;
	}

	private async fetchForResolution(
		scope: ResolveScope,
	): Promise<Array<{ id: number; publicId: string }>> {
		switch (scope.kind) {
			case 'team': {
				const r = await this.request<{ teams: Array<{ id: number; publicId: string }> }>(
					'GET',
					'/api/teams',
				);
				return r.teams ?? [];
			}
			case 'project': {
				const r = await this.request<{ projects: Array<{ id: number; publicId: string }> }>(
					'GET',
					`/api/projects/${scope.teamId}`,
				);
				return r.projects ?? [];
			}
			case 'service': {
				const r = await this.request<{ services: Array<{ id: number; publicId: string }> }>(
					'GET',
					`/api/services/${scope.teamId}`,
				);
				return r.services ?? [];
			}
			case 'deploy': {
				// Deploys list is paginated and returns `{ data, page, ... }` —
				// not the bare `{ deploys: [] }` shape used by other endpoints.
				// We fetch only the first page at the max perPage (100), so a
				// `dpl_…` publicId older than the 100 most-recent deploys for this
				// service will NOT resolve here (it throws NotFound). That's an
				// accepted trade-off: resolving by publicId is overwhelmingly used
				// for recent deploys, and walking every page to resolve a stale id
				// would add unbounded round-trips. Pass a numeric id to address an
				// older deploy directly.
				const r = await this.request<{
					data: Array<{ id: number; publicId: string }>;
					totalPages?: number;
				}>('GET', `/api/services/${scope.teamId}/${scope.serviceId}/deploys?perPage=100`);
				return r.data ?? [];
			}
			case 'database': {
				const r = await this.request<{
					databases: Array<{ id: number; publicId: string }>;
				}>('GET', `/api/databases/${scope.teamId}`);
				return r.databases ?? [];
			}
			case 'domain': {
				const r = await this.request<{ domains: Array<{ id: number; publicId: string }> }>(
					'GET',
					`/api/domains/${scope.teamId}`,
				);
				return r.domains ?? [];
			}
			case 'volume': {
				const r = await this.request<{
					volumes: Array<{ id: number; publicId: string }>;
				}>('GET', `/api/services/${scope.teamId}/${scope.serviceId}/volumes`);
				return r.volumes ?? [];
			}
			case 'cronExecution': {
				const r = await this.request<{
					executions: Array<{ id: number; publicId: string }>;
				}>('GET', `/api/services/${scope.teamId}/${scope.serviceId}/cron-executions`);
				return r.executions ?? [];
			}
			case 'environment': {
				// Walk the team's projects to collect every env. Slightly
				// expensive but envs are small in count and the cache
				// amortizes subsequent lookups for the same client instance.
				const projectsRes = await this.request<{
					projects: Array<{ id: number; publicId: string }>;
				}>('GET', `/api/projects/${scope.teamId}`);
				const envs: Array<{ id: number; publicId: string }> = [];
				for (const p of projectsRes.projects ?? []) {
					const r = await this.request<{
						environments: Array<{ id: number; publicId: string }>;
					}>('GET', `/api/environments/${scope.teamId}/${p.id}`);
					envs.push(...(r.environments ?? []));
				}
				return envs;
			}
			case 'devTask': {
				// Tasks are listed PER PROJECT, so resolving a `task_…` means walking the
				// team's projects. Kept behind the id cache like `environment` above: the
				// walk happens once per client, and only for a caller who passed a public
				// id in the first place (a numeric id never reaches here).
				const projectsRes = await this.request<{
					projects: Array<{ id: number; publicId: string }>;
				}>('GET', `/api/projects/${scope.teamId}`);
				const tasks: Array<{ id: number; publicId: string }> = [];
				for (const p of projectsRes.projects ?? []) {
					const r = await this.request<{
						tasks: Array<{ id: number; publicId: string }>;
					}>('GET', `/api/dev-env-tasks/${scope.teamId}?projectId=${p.id}`);
					tasks.push(...(r.tasks ?? []));
				}
				return tasks;
			}
		}
	}
}

/**
 * Parse the `Retry-After` header. RFC 9110 §10.2.3 allows either delta-seconds
 * or an HTTP-date; we accept seconds (HTTP-date is rare on JSON APIs). Returns
 * the delay in seconds, or `undefined` when absent/unparseable.
 */
function parseRetryAfter(header: string | null): number | undefined {
	return header && /^\d+$/.test(header) ? Number(header) : undefined;
}

/** Exponential back-off with jitter for retry attempt `n` (0-indexed). */
function backoffMs(attempt: number): number {
	const base = 250 * 2 ** attempt; // 250ms, 500ms, 1000ms, …
	const jitter = Math.random() * base * 0.25;
	return Math.min(base + jitter, MAX_RETRY_AFTER_MS);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheScope(scope: ResolveScope): string {
	switch (scope.kind) {
		case 'team':
			return 'team';
		case 'project':
		case 'service':
		case 'database':
		case 'domain':
		case 'environment':
			return `${scope.kind}:${scope.teamId}`;
		case 'devTask':
			return `devTask:${scope.teamId}`;
		case 'deploy':
		case 'volume':
		case 'cronExecution':
			return `${scope.kind}:${scope.teamId}:${scope.serviceId}`;
	}
}
