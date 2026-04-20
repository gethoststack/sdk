import type { HostStack } from '../client.ts';
import type { Deploy, TriggerDeployInput } from '../types.ts';

export class DeploysResource {
	constructor(private client: HostStack) {}

	/** List deploys for a service. */
	async list(teamId: number, serviceId: string): Promise<{ deploys: Deploy[] }> {
		return this.client.request('GET', `/api/services/${teamId}/${serviceId}/deploys`);
	}

	/** Get a single deploy by ID. */
	async get(teamId: number, serviceId: string, deployId: string): Promise<{ deploy: Deploy }> {
		return this.client.request(
			'GET',
			`/api/services/${teamId}/${serviceId}/deploys/${deployId}`,
		);
	}

	/** Trigger a new deploy. */
	async trigger(
		teamId: number,
		serviceId: string,
		data?: TriggerDeployInput,
	): Promise<{ deploy: Deploy }> {
		return this.client.request(
			'POST',
			`/api/services/${teamId}/${serviceId}/deploys`,
			data ?? {},
		);
	}

	/** Cancel an in-progress deploy. */
	async cancel(teamId: number, serviceId: string, deployId: string): Promise<void> {
		return this.client.request(
			'POST',
			`/api/services/${teamId}/${serviceId}/deploys/${deployId}/cancel`,
		);
	}

	/** Rollback to a previous deploy. */
	async rollback(teamId: number, serviceId: string, deployId: string): Promise<void> {
		return this.client.request(
			'POST',
			`/api/services/${teamId}/${serviceId}/deploys/${deployId}/rollback`,
		);
	}

	/** Get build logs for a deploy. */
	async getLogs(teamId: number, serviceId: string, deployId: string): Promise<{ logs: string }> {
		return this.client.request(
			'GET',
			`/api/services/${teamId}/${serviceId}/deploys/${deployId}/logs`,
		);
	}
}
