import type { HostStack, IdInput } from '../client.ts';
import type {
	BulkSetEnvVarsInput,
	CreateEnvVarInput,
	EnvImportResult,
	EnvVar,
	ImportEnvFileInput,
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

	/**
	 * Import a `.env` file. The server reads it strictly and refuses any line
	 * whose meaning depends on the reader — an unquoted `$` (a bcrypt hash), an
	 * unquoted ` #`, a key written twice — with its line number. A dry run unless
	 * `dryRun: false`. After an apply, every imported value is read back from
	 * storage and compared byte for byte (`roundTrip`); platform variables and
	 * templates are added at deploy, which is why the import refuses them. At
	 * most 1000 variables per file. The result never contains a value.
	 */
	async importFile(
		teamId: IdInput,
		serviceId: IdInput,
		data: ImportEnvFileInput,
	): Promise<EnvImportResult> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('POST', `/api/services/${tid}/${sid}/env/import`, data);
	}
}
