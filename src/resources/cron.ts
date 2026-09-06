import type { HostStack, IdInput } from '../client.ts';
import type { CronExecution } from '../types.ts';

export class CronResource {
	constructor(private client: HostStack) {}

	/** List cron executions for a service. */
	async list(
		teamId: IdInput,
		serviceId: IdInput,
		options?: { limit?: number },
	): Promise<{ executions: CronExecution[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const params = new URLSearchParams();
		if (options?.limit) params.set('limit', String(options.limit));
		const qs = params.toString();
		return this.client.request(
			'GET',
			`/api/services/${tid}/${sid}/cron-executions${qs ? `?${qs}` : ''}`,
		);
	}

	/** Get a single cron execution by ID. */
	async get(
		teamId: IdInput,
		serviceId: IdInput,
		executionId: IdInput,
	): Promise<{ execution: CronExecution }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const eid = await this.client.resolveId(executionId, {
			kind: 'cronExecution',
			teamId: tid,
			serviceId: sid,
		});
		return this.client.request('GET', `/api/services/${tid}/${sid}/cron-executions/${eid}`);
	}

	/** Trigger an immediate cron execution. */
	async trigger(teamId: IdInput, serviceId: IdInput): Promise<{ execution: CronExecution }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('POST', `/api/services/${tid}/${sid}/cron-executions/trigger`);
	}
}
