import type { HostStack } from '../client.ts';
import { type StreamLogsOptions, streamLogsViaPolling } from '../streaming.ts';
import type {
	CreateServiceInput,
	Service,
	ServiceConfig,
	ServiceMetrics,
	UpdateServiceConfigInput,
	UpdateServiceInput,
} from '../types.ts';

interface LogEntry {
	timestamp: string;
	level?: string | null;
	stream?: string | null;
	message: string;
}

export class ServicesResource {
	constructor(private client: HostStack) {}

	/** List all services for the active team. */
	async list(teamId: number): Promise<{ services: Service[] }> {
		return this.client.request('GET', `/api/services/${teamId}`);
	}

	/** Get a single service by ID. */
	async get(teamId: number, serviceId: string): Promise<{ service: Service }> {
		return this.client.request('GET', `/api/services/${teamId}/${serviceId}`);
	}

	/** Create a new service. */
	async create(teamId: number, data: CreateServiceInput): Promise<{ service: Service }> {
		return this.client.request('POST', `/api/services/${teamId}`, data);
	}

	/** Update a service. */
	async update(
		teamId: number,
		serviceId: string,
		data: UpdateServiceInput,
	): Promise<{ service: Service }> {
		return this.client.request('PATCH', `/api/services/${teamId}/${serviceId}`, data);
	}

	/** Delete a service. */
	async delete(teamId: number, serviceId: string): Promise<void> {
		return this.client.request('DELETE', `/api/services/${teamId}/${serviceId}`);
	}

	/** Suspend a service. */
	async suspend(teamId: number, serviceId: string): Promise<void> {
		return this.client.request('POST', `/api/services/${teamId}/${serviceId}/suspend`);
	}

	/** Resume a suspended service. */
	async resume(teamId: number, serviceId: string): Promise<void> {
		return this.client.request('POST', `/api/services/${teamId}/${serviceId}/resume`);
	}

	/** Get service metrics. */
	async getMetrics(teamId: number, serviceId: string): Promise<{ metrics: ServiceMetrics }> {
		return this.client.request('GET', `/api/services/${teamId}/${serviceId}/metrics`);
	}

	/** Get service configuration. */
	async getConfig(teamId: number, serviceId: string): Promise<{ config: ServiceConfig }> {
		return this.client.request('GET', `/api/services/${teamId}/${serviceId}/config`);
	}

	/** Update service configuration. */
	async updateConfig(
		teamId: number,
		serviceId: string,
		data: UpdateServiceConfigInput,
	): Promise<{ config: ServiceConfig }> {
		return this.client.request('PATCH', `/api/services/${teamId}/${serviceId}/config`, data);
	}

	/** Get runtime logs for a service. */
	async getRuntimeLogs(
		teamId: number,
		serviceId: string,
		options?: { lines?: number; since?: string; stream?: 'stdout' | 'stderr' },
	): Promise<{ logs: LogEntry[] | string }> {
		const params = new URLSearchParams();
		if (options?.lines) params.set('lines', String(options.lines));
		if (options?.since) params.set('since', options.since);
		if (options?.stream) params.set('stream', options.stream);
		const qs = params.toString();
		return this.client.request(
			'GET',
			`/api/services/${teamId}/${serviceId}/runtime-logs${qs ? `?${qs}` : ''}`,
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
	streamLogs(
		teamId: number,
		serviceId: string,
		options?: StreamLogsOptions,
	): AsyncGenerator<LogEntry> {
		const basePath = `/api/services/${teamId}/${serviceId}/runtime-logs`;
		return streamLogsViaPolling(
			(path) => this.client.request('GET', path),
			basePath,
			options,
		);
	}
}
