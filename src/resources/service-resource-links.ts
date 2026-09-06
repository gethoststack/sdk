import type { HostStack, IdInput } from '../client.ts';
import type { LinkResourceInput, ManagedResource, ServiceResourceLink } from '../types.ts';

/**
 * Link managed resources (databases, object storage, queues, search,
 * email domains) to a service.
 *
 * A link is what turns a managed resource into environment variables on the
 * running container. At deploy time the platform walks every link on the
 * service and injects the resource's connection info, prefixed by the link's
 * `alias` so one service can consume several resources of the same type
 * without collisions (alias `CATALOG` on a search link →
 * `MEILI_CATALOG_URL`, `MEILI_CATALOG_MASTER_KEY`).
 *
 * On top of the alias-prefixed vars, the first linked resource of each engine
 * class also lands on the conventional Heroku/Render-style name —
 * `DATABASE_URL` (postgres/mysql/mariadb), `REDIS_URL`, `MONGO_URL` — so an
 * app that reads `process.env.DATABASE_URL` works with no code changes. Those
 * are injected with `??=`, so an explicit env var you set yourself always
 * wins.
 *
 * Links take effect on the NEXT deploy: create the link, then
 * {@link DeploysResource.trigger} the service.
 *
 * @example
 * ```ts
 * const { database } = await client.databases.create(team, {
 *   name: 'app-db', engine: 'postgres', projectId: 12,
 * });
 * await client.serviceResourceLinks.create(team, service, {
 *   resourceType: 'database',
 *   resourceId: database.id,
 *   alias: 'APP_DB',
 * });
 * await client.deploys.trigger(team, service);  // DATABASE_URL now injected
 * ```
 */
export class ServiceResourceLinksResource {
	constructor(private client: HostStack) {}

	/**
	 * List EVERY managed resource the team owns — databases, object storage
	 * buckets, queues, search indexes, email domains — in one call, from the
	 * unified `managed_resources` read-model.
	 *
	 * This is how you find the numeric `id` to pass to {@link create} for a
	 * resource type that has no dedicated list method of its own.
	 */
	async listManagedResources(teamId: IdInput): Promise<{ resources: ManagedResource[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		// Mounted under /api/teams (routes/index.ts), not a /api/managed-resources
		// prefix — the route file name and its mount point differ here.
		return this.client.request('GET', `/api/teams/${tid}/resources`);
	}

	/** List every resource linked to a service. */
	async list(teamId: IdInput, serviceId: IdInput): Promise<{ links: ServiceResourceLink[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('GET', `/api/services/${tid}/${sid}/resources`);
	}

	/**
	 * Link a resource to a service. `resourceId` is the resource's NUMERIC id
	 * (e.g. `database.id`, not `database.publicId`). The link is injected as
	 * env vars on the next deploy.
	 */
	async create(
		teamId: IdInput,
		serviceId: IdInput,
		data: LinkResourceInput,
	): Promise<{ link: ServiceResourceLink }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('POST', `/api/services/${tid}/${sid}/resources`, data);
	}

	/**
	 * Rename a link's alias. This RENAMES the injected env vars on the next
	 * deploy — an app still reading the old prefix will break until it is
	 * updated.
	 */
	async updateAlias(
		teamId: IdInput,
		serviceId: IdInput,
		linkId: number,
		alias: string,
	): Promise<{ link: ServiceResourceLink }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('PATCH', `/api/services/${tid}/${sid}/resources/${linkId}`, {
			alias,
		});
	}

	/**
	 * Remove a link. The resource itself is NOT deleted — only the binding,
	 * and the env vars it injected, which disappear on the next deploy.
	 */
	async delete(teamId: IdInput, serviceId: IdInput, linkId: number): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('DELETE', `/api/services/${tid}/${sid}/resources/${linkId}`);
	}
}
