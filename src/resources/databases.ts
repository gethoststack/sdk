import type { HostStack } from '../client.ts';
import type {
	CreateDatabaseInput,
	Database,
	DatabaseCredentials,
	UpdateDatabaseInput,
} from '../types.ts';

export class DatabasesResource {
	constructor(private client: HostStack) {}

	/** List all databases for a project. */
	async list(teamId: number, projectId: number): Promise<{ databases: Database[] }> {
		return this.client.request('GET', `/api/databases/${teamId}?projectId=${projectId}`);
	}

	/** Get a single database by ID. */
	async get(teamId: number, databaseId: string): Promise<{ database: Database }> {
		return this.client.request('GET', `/api/databases/${teamId}/${databaseId}`);
	}

	/** Create a new database. */
	async create(teamId: number, data: CreateDatabaseInput): Promise<{ database: Database }> {
		return this.client.request('POST', `/api/databases/${teamId}`, data);
	}

	/** Update a database. */
	async update(
		teamId: number,
		databaseId: string,
		data: UpdateDatabaseInput,
	): Promise<{ database: Database }> {
		return this.client.request('PATCH', `/api/databases/${teamId}/${databaseId}`, data);
	}

	/** Delete a database. */
	async delete(teamId: number, databaseId: string): Promise<void> {
		return this.client.request('DELETE', `/api/databases/${teamId}/${databaseId}`);
	}

	/** Suspend a database. */
	async suspend(teamId: number, databaseId: string): Promise<void> {
		return this.client.request('POST', `/api/databases/${teamId}/${databaseId}/suspend`);
	}

	/** Resume a suspended database. */
	async resume(teamId: number, databaseId: string): Promise<void> {
		return this.client.request('POST', `/api/databases/${teamId}/${databaseId}/resume`);
	}

	/** Get connection credentials. */
	async getCredentials(
		teamId: number,
		databaseId: string,
	): Promise<{ credentials: DatabaseCredentials }> {
		return this.client.request('GET', `/api/databases/${teamId}/${databaseId}/credentials`);
	}

	/** Reset the database password. */
	async resetPassword(teamId: number, databaseId: string): Promise<void> {
		return this.client.request('POST', `/api/databases/${teamId}/${databaseId}/reset-password`);
	}
}
