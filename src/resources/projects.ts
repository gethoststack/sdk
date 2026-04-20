import type { HostStack } from '../client.ts';
import type { CreateProjectInput, Project, UpdateProjectInput } from '../types.ts';

export class ProjectsResource {
	constructor(private client: HostStack) {}

	/** List all projects for the active team. */
	async list(teamId: number): Promise<{ projects: Project[] }> {
		return this.client.request('GET', `/api/projects/${teamId}`);
	}

	/** Get a single project by ID. */
	async get(teamId: number, projectId: string): Promise<{ project: Project }> {
		return this.client.request('GET', `/api/projects/${teamId}/${projectId}`);
	}

	/** Create a new project. */
	async create(teamId: number, data: CreateProjectInput): Promise<{ project: Project }> {
		return this.client.request('POST', `/api/projects/${teamId}`, data);
	}

	/** Update a project. */
	async update(
		teamId: number,
		projectId: string,
		data: UpdateProjectInput,
	): Promise<{ project: Project }> {
		return this.client.request('PATCH', `/api/projects/${teamId}/${projectId}`, data);
	}

	/** Delete a project. */
	async delete(teamId: number, projectId: string): Promise<void> {
		return this.client.request('DELETE', `/api/projects/${teamId}/${projectId}`);
	}
}
