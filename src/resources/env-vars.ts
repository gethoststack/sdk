import type { HostStack, IdInput } from '../client.ts';
import type {
	BulkSetEnvVarsInput,
	CreateEnvVarInput,
	EnvVar,
	UpdateEnvVarInput,
} from '../types.ts';

export class EnvVarsResource {
	constructor(private client: HostStack) {}

	/** List all environment variables for a service. */
	async list(teamId: IdInput, serviceId: IdInput): Promise<{ envVars: EnvVar[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('GET', `/api/services/${tid}/${sid}/env`);
	}

	/** Create a new environment variable. */
	async create(
		teamId: IdInput,
		serviceId: IdInput,
		data: CreateEnvVarInput,
	): Promise<{ envVar: EnvVar }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('POST', `/api/services/${tid}/${sid}/env`, data);
	}

	/** Update an environment variable. */
	async update(
		teamId: IdInput,
		serviceId: IdInput,
		envVarId: IdInput,
		data: UpdateEnvVarInput,
	): Promise<{ envVar: EnvVar }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const eid = typeof envVarId === 'number' ? envVarId : Number.parseInt(envVarId, 10);
		if (Number.isNaN(eid)) {
			throw new Error(
				`Invalid envVarId "${envVarId}": expected a numeric id (env vars have no publicId — read it from list()).`,
			);
		}
		return this.client.request('PATCH', `/api/services/${tid}/${sid}/env/${eid}`, data);
	}

	/** Delete an environment variable. */
	async delete(teamId: IdInput, serviceId: IdInput, envVarId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const eid = typeof envVarId === 'number' ? envVarId : Number.parseInt(envVarId, 10);
		if (Number.isNaN(eid)) {
			throw new Error(
				`Invalid envVarId "${envVarId}": expected a numeric id (env vars have no publicId — read it from list()).`,
			);
		}
		return this.client.request('DELETE', `/api/services/${tid}/${sid}/env/${eid}`);
	}

	/** Bulk set environment variables (create or update). */
	async bulkSet(teamId: IdInput, serviceId: IdInput, data: BulkSetEnvVarsInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('PUT', `/api/services/${tid}/${sid}/env/bulk`, data);
	}
}
