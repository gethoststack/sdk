import type { HostStack, IdInput } from '../client.ts';
import type { CreateProjectInput, Project, UpdateProjectInput } from '../types.ts';

export class ProjectsResource {
	constructor(private client: HostStack) {}

	/** List all projects for the active team. */
	async list(teamId: IdInput): Promise<{ projects: Project[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/projects/${tid}`);
	}

	/** Get a single project by ID. */
	async get(teamId: IdInput, projectId: IdInput): Promise<{ project: Project }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const pid = await this.client.resolveId(projectId, { kind: 'project', teamId: tid });
		return this.client.request('GET', `/api/projects/${tid}/${pid}`);
	}

	/** Create a new project. */
	async create(teamId: IdInput, data: CreateProjectInput): Promise<{ project: Project }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/projects/${tid}`, data);
	}

	/** Update a project. */
	async update(
		teamId: IdInput,
		projectId: IdInput,
		data: UpdateProjectInput,
	): Promise<{ project: Project }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const pid = await this.client.resolveId(projectId, { kind: 'project', teamId: tid });
		return this.client.request('PATCH', `/api/projects/${tid}/${pid}`, data);
	}

	/** Delete a project. */
	async delete(teamId: IdInput, projectId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const pid = await this.client.resolveId(projectId, { kind: 'project', teamId: tid });
		return this.client.request('DELETE', `/api/projects/${tid}/${pid}`);
	}
}
