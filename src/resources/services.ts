import type { HostStack, IdInput } from '../client.ts';
import { type StreamLogsOptions, streamLogsViaPolling } from '../streaming.ts';
import type {
	CreateDevEnvironmentInput,
	CreateServiceInput,
	DevEnvironment,
	Service,
	ServiceConfig,
	ServiceMetricsSnapshot,
	ServiceStatus,
	ServiceType,
	UpdateServiceConfigInput,
	UpdateServiceInput,
} from '../types.ts';

interface LogEntry {
	timestamp: string;
	/**
	 * Parsed structured log level (pino numeric or string envelopes).
	 * `undefined` for plain-text logs.
	 */
	level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | null;
	stream?: 'stdout' | 'stderr' | null;
	message: string;
}

export class ServicesResource {
	constructor(private client: HostStack) {}

	/**
	 * List services for the active team.
	 *
	 * Optional filters narrow by project, environment, status, or type.
	 * The server treats unknown enum values as no match (returns empty)
	 * rather than 400-ing.
	 *
	 * Dev boxes (agentic dev-env services) are EXCLUDED by default — set
	 * `devEnvironment: true` to include them (the server accepts
	 * `?devEnvironment=true`). For the dedicated, annotated dev-box listing
	 * use `listDevEnvironments` instead.
	 */
	async list(
		teamId: IdInput,
		filters?: {
			projectId?: number | string;
			environmentId?: number | string;
			status?: ServiceStatus;
			type?: ServiceType;
			/** Include dev boxes (excluded by default). */
			devEnvironment?: boolean;
		},
	): Promise<{ services: Service[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const params = new URLSearchParams();
		if (filters?.projectId !== undefined) params.set('projectId', String(filters.projectId));
		if (filters?.environmentId !== undefined)
			params.set('environmentId', String(filters.environmentId));
		if (filters?.status) params.set('status', filters.status);
		if (filters?.type) params.set('type', filters.type);
		if (filters?.devEnvironment) params.set('devEnvironment', 'true');
		const qs = params.toString();
		return this.client.request('GET', `/api/services/${tid}${qs ? `?${qs}` : ''}`);
	}

	/** Get a single service by ID. */
	async get(teamId: IdInput, serviceId: IdInput): Promise<{ service: Service }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('GET', `/api/services/${tid}/${sid}`);
	}

	/** Create a new service. */
	async create(
		teamId: IdInput,
		data: CreateServiceInput,
	): Promise<{
		service: Service;
		deployId?: number | null;
		linkErrors?: { resourceType: string; resourceId: number; error: string }[];
	}> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/services/${tid}`, data);
	}

	/** Update a service. */
	async update(
		teamId: IdInput,
		serviceId: IdInput,
		data: UpdateServiceInput,
	): Promise<{ service: Service }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('PATCH', `/api/services/${tid}/${sid}`, data);
	}

	/** Delete a service. */
	async delete(teamId: IdInput, serviceId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('DELETE', `/api/services/${tid}/${sid}`);
	}

	/**
	 * Resize a service (incl. dev boxes) to a different size tier. This is the
	 * supported way to scale past the current tier's memory/CPU/disk ceiling —
	 * per-config overrides are clamped to the tier, so growing beyond it
	 * requires moving the tier. The new tier's memory/CPU apply LIVE to the
	 * running container (no recreate); disk grows on the next recreate. Dev
	 * boxes are floored to the OOM-safe minimum size server-side.
	 */
	async resize(teamId: IdInput, serviceId: IdInput, plan: string): Promise<{ service: Service }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('PATCH', `/api/services/${tid}/${sid}`, { plan });
	}

	/**
	 * List the team's dev environments (the Development section), each annotated
	 * with the companion services attached to it (`databases`).
	 */
	async listDevEnvironments(teamId: IdInput): Promise<{ environments: DevEnvironment[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/dev-environments/${tid}`);
	}

	/**
	 * Create a STANDALONE dev environment — a cloud box (Claude Code / Codex /
	 * OpenCode on a persistent /workspace) from a connected GitHub repo, an
	 * arbitrary clone URL, or blank, with optional companion Postgres / Redis /
	 * Meilisearch. Unlike `spinUpDevEnvironment`, there's no source service — the
	 * box lives in the team's hidden Development home. Returns the box, its dev
	 * URL, and the first deploy id. Tear it down with `tearDownDevEnvironment`.
	 */
	async createDevEnvironment(
		teamId: IdInput,
		data: CreateDevEnvironmentInput,
	): Promise<{ service: Service; devUrl: string; deployId: number | null }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/dev-environments/${tid}`, data);
	}

	/**
	 * Spin up an agentic dev environment FROM this service: a dev box that runs
	 * a clone of the app (repo auto-cloned into /workspace, env-vars copied, and
	 * the linked database cloned so it never touches prod), with an unguessable
	 * public dev URL and seamless `git push`. Returns the dev box, its dev URL,
	 * and the first deploy id.
	 */
	async spinUpDevEnvironment(
		teamId: IdInput,
		serviceId: IdInput,
		options?: { includeDatabaseClone?: boolean; name?: string },
	): Promise<{ service: Service; devUrl: string; deployId: number | null }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request(
			'POST',
			`/api/services/${tid}/${sid}/dev-environment`,
			options ?? {},
		);
	}

	/**
	 * Tear a dev environment down: removes the dev box and cascade-deletes its
	 * cloned database, /workspace volume, and the empty `development`
	 * environment. `serviceId` is the dev box itself.
	 */
	async tearDownDevEnvironment(teamId: IdInput, serviceId: IdInput): Promise<{ success: true }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('DELETE', `/api/services/${tid}/${sid}/dev-environment`);
	}

	/** Suspend a service. */
	async suspend(teamId: IdInput, serviceId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('POST', `/api/services/${tid}/${sid}/suspend`);
	}

	/** Resume a suspended service. */
	async resume(teamId: IdInput, serviceId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('POST', `/api/services/${tid}/${sid}/resume`);
	}

	/**
	 * Get the latest metrics snapshot for a service.
	 *
	 * Returns `metrics: null` before the first agent sample lands;
	 * `serverOverview: null` when the service is not currently placed
	 * (suspended, between deploys, etc).
	 */
	async getMetrics(teamId: IdInput, serviceId: IdInput): Promise<ServiceMetricsSnapshot> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('GET', `/api/services/${tid}/${sid}/metrics`);
	}

	/**
	 * Get a metrics time series for a service.
	 *
	 * `from`/`to` accept ISO-8601 timestamps. Omit both for the trailing
	 * hour. Server picks the resolution: raw samples ≤7d, hourly pre-
	 * aggregates ≤30d, daily beyond that. Up to ~500 points returned.
	 */
	async getMetricsHistory(
		teamId: IdInput,
		serviceId: IdInput,
		options?: { from?: string; to?: string },
	): Promise<{
		history: Array<{
			timestamp: string;
			cpuPercent: number;
			memoryUsedMb: number;
			memoryLimitMb: number;
			networkRxBytes: number;
			networkTxBytes: number;
			diskUsedMb: number;
		}>;
	}> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const params = new URLSearchParams();
		if (options?.from) params.set('from', options.from);
		if (options?.to) params.set('to', options.to);
		const qs = params.toString();
		return this.client.request(
			'GET',
			`/api/services/${tid}/${sid}/metrics/history${qs ? `?${qs}` : ''}`,
		);
	}

	/** Get service configuration. */
	async getConfig(teamId: IdInput, serviceId: IdInput): Promise<{ config: ServiceConfig }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('GET', `/api/services/${tid}/${sid}/config`);
	}

	/** Update service configuration. */
	async updateConfig(
		teamId: IdInput,
		serviceId: IdInput,
		data: UpdateServiceConfigInput,
	): Promise<{ config: ServiceConfig }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('PATCH', `/api/services/${tid}/${sid}/config`, data);
	}

	/**
	 * Get runtime logs for a service.
	 *
	 * `since`/`until` accept either an ISO-8601 timestamp or a short
	 * relative offset like `-5m`, `-1h`, `-2d`.
	 *
	 * `search` does case-insensitive substring filtering server-side
	 * (≤100 chars). `countOnly` returns just `{ count: N }` for cheap
	 * polling — useful when you want to know "how many error lines in the
	 * last 5 minutes" without paying the bytes.
	 */
	async getRuntimeLogs(
		teamId: IdInput,
		serviceId: IdInput,
		options?: {
			lines?: number;
			limit?: number;
			since?: string;
			until?: string;
			stream?: 'stdout' | 'stderr';
			level?: 'stdout' | 'stderr' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
			search?: string;
			grep?: string;
			countOnly?: boolean;
		},
	): Promise<{ logs: LogEntry[] | string } | { count: number }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const params = new URLSearchParams();
		const lim = options?.limit ?? options?.lines;
		if (lim != null) params.set('limit', String(lim));
		if (options?.since) params.set('since', options.since);
		if (options?.until) params.set('until', options.until);
		if (options?.stream) params.set('stream', options.stream);
		if (options?.level) params.set('level', options.level);
		const grep = options?.grep ?? options?.search;
		if (grep) params.set('search', grep);
		if (options?.countOnly) params.set('count_only', '1');
		const qs = params.toString();
		return this.client.request(
			'GET',
			`/api/services/${tid}/${sid}/runtime-logs${qs ? `?${qs}` : ''}`,
		);
	}

	/**
	 * Stream runtime logs for a service by polling the logs endpoint.
	 * Yields log entries as they appear. Use an AbortController to stop.
	 *
	 * @example
	 * ```ts
	 * const ac = new AbortController();
	 * for await (const entry of client.services.streamLogs(teamId, serviceId, { signal: ac.signal })) {
	 *   console.log(entry.message);
	 * }
	 * ```
	 */
	async *streamLogs(
		teamId: IdInput,
		serviceId: IdInput,
		options?: StreamLogsOptions,
	): AsyncGenerator<LogEntry> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const basePath = `/api/services/${tid}/${sid}/runtime-logs`;
		yield* streamLogsViaPolling((path) => this.client.request('GET', path), basePath, options);
	}
}
