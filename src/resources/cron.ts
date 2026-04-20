import type { HostStack } from '../client.ts';
import type { CronExecution } from '../types.ts';

export class CronResource {
	constructor(private client: HostStack) {}

	/** List cron executions for a service. */
	async list(
		teamId: number,
		serviceId: string,
		options?: { limit?: number },
	): Promise<{ executions: CronExecution[] }> {
		const params = new URLSearchParams();
		if (options?.limit) params.set('limit', String(options.limit));
		const qs = params.toString();
		return this.client.request(
			'GET',
			`/api/services/${teamId}/${serviceId}/cron-executions${qs ? `?${qs}` : ''}`,
		);
	}

	/** Get a single cron execution by ID. */
	async get(
		teamId: number,
		serviceId: string,
		executionId: string,
	): Promise<{ execution: CronExecution }> {
		return this.client.request(
			'GET',
			`/api/services/${teamId}/${serviceId}/cron-executions/${executionId}`,
		);
	}

	/** Trigger an immediate cron execution. */
	async trigger(teamId: number, serviceId: string): Promise<{ execution: CronExecution }> {
		return this.client.request(
			'POST',
			`/api/services/${teamId}/${serviceId}/cron-executions/trigger`,
		);
	}
}
