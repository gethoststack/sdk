import type { HostStack } from '../client.ts';
import type {
	BulkSetEnvVarsInput,
	CreateEnvVarInput,
	EnvVar,
	UpdateEnvVarInput,
} from '../types.ts';

export class EnvVarsResource {
	constructor(private client: HostStack) {}

	/** List all environment variables for a service. */
	async list(teamId: number, serviceId: string): Promise<{ envVars: EnvVar[] }> {
		return this.client.request('GET', `/api/services/${teamId}/${serviceId}/env`);
	}

	/** Create a new environment variable. */
	async create(
		teamId: number,
		serviceId: string,
		data: CreateEnvVarInput,
	): Promise<{ envVar: EnvVar }> {
		return this.client.request('POST', `/api/services/${teamId}/${serviceId}/env`, data);
	}

	/** Update an environment variable. */
	async update(
		teamId: number,
		serviceId: string,
		envVarId: string,
		data: UpdateEnvVarInput,
	): Promise<{ envVar: EnvVar }> {
		return this.client.request(
			'PATCH',
			`/api/services/${teamId}/${serviceId}/env/${envVarId}`,
			data,
		);
	}

	/** Delete an environment variable. */
	async delete(teamId: number, serviceId: string, envVarId: string): Promise<void> {
		return this.client.request(
			'DELETE',
			`/api/services/${teamId}/${serviceId}/env/${envVarId}`,
		);
	}

	/** Bulk set environment variables (create or update). */
	async bulkSet(teamId: number, serviceId: string, data: BulkSetEnvVarsInput): Promise<void> {
		return this.client.request('PUT', `/api/services/${teamId}/${serviceId}/env/bulk`, data);
	}
}
