import type { HostStack, IdInput } from '../client.ts';
import type {
	CreateDatabaseInput,
	Database,
	DatabaseCredentials,
	UpdateDatabaseInput,
} from '../types.ts';

export class DatabasesResource {
	constructor(private client: HostStack) {}

	/**
	 * List databases for the team. Pass `projectId` to scope to one
	 * project; omit it to list every database the team owns.
	 */
	async list(teamId: IdInput, projectId?: IdInput): Promise<{ databases: Database[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		if (projectId === undefined) {
			return this.client.request('GET', `/api/databases/${tid}`);
		}
		const pid = await this.client.resolveId(projectId, { kind: 'project', teamId: tid });
		return this.client.request('GET', `/api/databases/${tid}?projectId=${pid}`);
	}

	/** Get a single database by ID. */
	async get(teamId: IdInput, databaseId: IdInput): Promise<{ database: Database }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('GET', `/api/databases/${tid}/${did}`);
	}

	/** Create a new database. */
	async create(teamId: IdInput, data: CreateDatabaseInput): Promise<{ database: Database }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/databases/${tid}`, data);
	}

	/** Update a database. */
	async update(
		teamId: IdInput,
		databaseId: IdInput,
		data: UpdateDatabaseInput,
	): Promise<{ database: Database }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('PATCH', `/api/databases/${tid}/${did}`, data);
	}

	/** Delete a database. */
	async delete(teamId: IdInput, databaseId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('DELETE', `/api/databases/${tid}/${did}`);
	}

	/** Suspend a database. */
	async suspend(teamId: IdInput, databaseId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('POST', `/api/databases/${tid}/${did}/suspend`);
	}

	/** Resume a suspended database. */
	async resume(teamId: IdInput, databaseId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('POST', `/api/databases/${tid}/${did}/resume`);
	}

	/**
	 * Restart a database's container in place (brief downtime of a few
	 * seconds; same connection URL). The database must be `available` —
	 * resume a suspended database first.
	 */
	async restart(teamId: IdInput, databaseId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('POST', `/api/databases/${tid}/${did}/restart`);
	}

	/** Get connection credentials. */
	async getCredentials(
		teamId: IdInput,
		databaseId: IdInput,
	): Promise<{ credentials: DatabaseCredentials }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('GET', `/api/databases/${tid}/${did}/credentials`);
	}

	/** Reset the database password. */
	async resetPassword(teamId: IdInput, databaseId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('POST', `/api/databases/${tid}/${did}/reset-password`);
	}

	/**
	 * v89 (skyskraber #18): run a single READ ONLY statement against a
	 * managed postgres database. Wrapped server-side in
	 * `BEGIN TRANSACTION READ ONLY` with a 30s statement_timeout and a
	 * 1000-row cap. Writes (INSERT/UPDATE/DELETE/DDL) fail with a
	 * postgres "cannot execute … in a read-only transaction" error.
	 *
	 * Every call is audit-logged regardless of outcome (admin role
	 * required server-side).
	 *
	 * Returns columns + rows-as-strings (CSV-serialized from psql) plus
	 * a `truncated` flag if the result set was capped.
	 */
	async query(
		teamId: IdInput,
		databaseId: IdInput,
		sql: string,
	): Promise<{
		columns: string[];
		rows: string[][];
		rowCount: number;
		truncated: boolean;
		durationMs: number;
	}> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('POST', `/api/databases/${tid}/${did}/query`, { sql });
	}

	/**
	 * v89 Phase 4: trigger a single-node → HA migration (Patroni 3-node
	 * cluster). The customer-facing database briefly goes read-only during
	 * the pg_dump → bootstrap → pg_restore. The standalone container stays
	 * running (read-only) for 24 h as a rollback target before being
	 * decommissioned automatically.
	 *
	 * Requires (server-side): PATRONI_ENABLED env on the deployment +
	 * `teams.ha_beta=true` on this team. Throws 403 otherwise.
	 *
	 * Returns 202 — the upgrade is async; poll `get(...)` until
	 * `pgEngineType === 'patroni'` + `status === 'available'` to confirm.
	 */
	async upgradeToHa(teamId: IdInput, databaseId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('POST', `/api/databases/${tid}/${did}/upgrade-to-ha`);
	}

	/**
	 * In-place engine version upgrade (postgres/redis standalone). The agent
	 * dumps the live data, recreates the container at `version` under the same
	 * DNS name, and restores — so connection URLs stay valid. There's a brief
	 * interruption (seconds) while the new container comes up.
	 *
	 * `version` must be a supported, strictly-newer version for the engine
	 * (e.g. '18' for postgres, '8' for redis). Throws 400 otherwise.
	 *
	 * Returns 202 — the upgrade is async; poll `get(...)` until `version`
	 * matches the target and `status === 'available'` to confirm.
	 */
	async upgradeVersion(teamId: IdInput, databaseId: IdInput, version: string): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('POST', `/api/databases/${tid}/${did}/upgrade-version`, {
			version,
		});
	}

	/**
	 * v89 Phase 5: cluster topology + failover history for a Patroni-managed
	 * Postgres database. Returns 400 for standalone databases — call
	 * `get(...)` first if you need to branch.
	 */
	async getCluster(
		teamId: IdInput,
		databaseId: IdInput,
	): Promise<{
		members: Array<{
			id: number;
			memberRole: 'etcd' | 'primary-candidate' | 'replica' | 'proxy';
			containerId: string;
			workerHostId: number | null;
			joinedAt: string;
			leftAt: string | null;
		}>;
		failovers: Array<{
			id: number;
			createdAt: string;
			oldLeader: string | null;
			newLeader: string | null;
		}>;
	}> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(databaseId, { kind: 'database', teamId: tid });
		return this.client.request('GET', `/api/databases/${tid}/${did}/cluster`);
	}
}
