import type { HostStack, IdInput } from '../client.ts';

export interface Environment {
	id: number;
	publicId: string;
	projectId: number;
	name: string;
	type: 'production' | 'staging' | 'development' | 'preview';
	isDefault: boolean;
	isProtected: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateEnvironmentInput {
	name: string;
	type: 'production' | 'staging' | 'development' | 'preview';
	isProtected?: boolean;
}

export interface UpdateEnvironmentInput {
	name?: string;
	isDefault?: boolean;
	isProtected?: boolean;
}

/**
 * v66 P5: programmatic env management. Each project has at least a
 * Production env auto-created at project creation; you can add more
 * via `create` and bind services/databases to them via the
 * `environmentId` field on those resources' create inputs.
 *
 * @example
 * ```ts
 * const { environment: staging } = await client.environments.create(
 *   teamId,
 *   projectId,
 *   { name: 'Staging', type: 'staging' }
 * );
 * await client.services.create(teamId, {
 *   projectId,
 *   environmentId: staging.id,
 *   name: 'api',
 *   type: 'web_service',
 *   // ...
 * });
 * ```
 */
export class EnvironmentsResource {
	constructor(private client: HostStack) {}

	/** List all environments for a project. */
	async list(teamId: IdInput, projectId: IdInput): Promise<{ environments: Environment[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const pid = await this.client.resolveId(projectId, { kind: 'project', teamId: tid });
		return this.client.request('GET', `/api/environments/${tid}/${pid}`);
	}

	/** Get a single environment by id. */
	async get(
		teamId: IdInput,
		projectId: IdInput,
		envId: IdInput,
	): Promise<{ environment: Environment }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const pid = await this.client.resolveId(projectId, { kind: 'project', teamId: tid });
		const eid = await this.client.resolveId(envId, { kind: 'environment', teamId: tid });
		return this.client.request('GET', `/api/environments/${tid}/${pid}/${eid}`);
	}

	/** Create a new environment in the given project. */
	async create(
		teamId: IdInput,
		projectId: IdInput,
		data: CreateEnvironmentInput,
	): Promise<{ environment: Environment }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const pid = await this.client.resolveId(projectId, { kind: 'project', teamId: tid });
		return this.client.request('POST', `/api/environments/${tid}/${pid}`, data);
	}

	/** Update environment metadata (name, default flag, protected flag). */
	async update(
		teamId: IdInput,
		projectId: IdInput,
		envId: IdInput,
		data: UpdateEnvironmentInput,
	): Promise<{ environment: Environment }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const pid = await this.client.resolveId(projectId, { kind: 'project', teamId: tid });
		const eid = await this.client.resolveId(envId, { kind: 'environment', teamId: tid });
		return this.client.request('PATCH', `/api/environments/${tid}/${pid}/${eid}`, data);
	}

	/**
	 * Delete an environment. The API blocks delete when the env still
	 * has services or databases attached — destroy them first or move
	 * them to another env. Cannot delete the project's default env.
	 */
	async delete(teamId: IdInput, projectId: IdInput, envId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const pid = await this.client.resolveId(projectId, { kind: 'project', teamId: tid });
		const eid = await this.client.resolveId(envId, { kind: 'environment', teamId: tid });
		return this.client.request('DELETE', `/api/environments/${tid}/${pid}/${eid}`);
	}
}
