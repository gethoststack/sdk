import type { HostStack, IdInput } from '../client.ts';
import type { Deploy, TriggerDeployInput } from '../types.ts';

export interface DeployListResponse {
	data: Deploy[];
	page: number;
	perPage: number;
	total: number;
	totalPages: number;
}

export class DeploysResource {
	constructor(private client: HostStack) {}

	/**
	 * List deploys for a service. Paginated — pass `page` / `perPage` to walk
	 * pages. Default page=1, perPage=25, hard cap perPage=100.
	 */
	async list(
		teamId: IdInput,
		serviceId: IdInput,
		options?: { page?: number; perPage?: number },
	): Promise<DeployListResponse> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const params = new URLSearchParams();
		if (options?.page !== undefined) params.set('page', String(options.page));
		if (options?.perPage !== undefined) params.set('perPage', String(options.perPage));
		const qs = params.toString();
		return this.client.request(
			'GET',
			`/api/services/${tid}/${sid}/deploys${qs ? `?${qs}` : ''}`,
		);
	}

	/** Get a single deploy by ID. */
	async get(teamId: IdInput, serviceId: IdInput, deployId: IdInput): Promise<{ deploy: Deploy }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const did = await this.client.resolveId(deployId, {
			kind: 'deploy',
			teamId: tid,
			serviceId: sid,
		});
		return this.client.request('GET', `/api/services/${tid}/${sid}/deploys/${did}`);
	}

	/** Trigger a new deploy. */
	async trigger(
		teamId: IdInput,
		serviceId: IdInput,
		data?: TriggerDeployInput,
	): Promise<{ deploy: Deploy }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('POST', `/api/services/${tid}/${sid}/deploys`, data ?? {});
	}

	/** Cancel an in-progress deploy. */
	async cancel(teamId: IdInput, serviceId: IdInput, deployId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const did = await this.client.resolveId(deployId, {
			kind: 'deploy',
			teamId: tid,
			serviceId: sid,
		});
		return this.client.request('POST', `/api/services/${tid}/${sid}/deploys/${did}/cancel`);
	}

	/** Rollback to a previous deploy. */
	async rollback(teamId: IdInput, serviceId: IdInput, deployId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const did = await this.client.resolveId(deployId, {
			kind: 'deploy',
			teamId: tid,
			serviceId: sid,
		});
		return this.client.request('POST', `/api/services/${tid}/${sid}/deploys/${did}/rollback`);
	}

	/**
	 * v66 P5: promote a built deploy to a sibling service in another
	 * environment. Reuses the source deploy's docker image (no rebuild).
	 * If no sibling service exists in the target env yet, the API auto-
	 * creates one by cloning the source service's config.
	 */
	async promote(
		teamId: IdInput,
		serviceId: IdInput,
		deployId: IdInput,
		targetEnvironmentId: number,
	): Promise<{ deploy: Deploy }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const did = await this.client.resolveId(deployId, {
			kind: 'deploy',
			teamId: tid,
			serviceId: sid,
		});
		return this.client.request('POST', `/api/services/${tid}/${sid}/deploys/${did}/promote`, {
			targetEnvironmentId,
		});
	}

	/**
	 * Get build logs for a deploy.
	 *
	 * Pagination: pass `afterId` from the previous response's `nextAfterId`
	 * to fetch the next page. Per-call cap is 5000; default 500.
	 */
	async getLogs(
		teamId: IdInput,
		serviceId: IdInput,
		deployId: IdInput,
		options?: {
			search?: string;
			level?: string;
			phase?: string;
			limit?: number;
			afterId?: number;
		},
	): Promise<{ logs: DeployLogEntry[]; nextAfterId: number | null }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const did = await this.client.resolveId(deployId, {
			kind: 'deploy',
			teamId: tid,
			serviceId: sid,
		});
		const params = new URLSearchParams();
		if (options?.search) params.set('search', options.search);
		if (options?.level) params.set('level', options.level);
		if (options?.phase) params.set('phase', options.phase);
		if (options?.limit !== undefined) params.set('limit', String(options.limit));
		if (options?.afterId !== undefined) params.set('afterId', String(options.afterId));
		const qs = params.toString();
		const url = `/api/services/${tid}/${sid}/deploys/${did}/logs${qs ? `?${qs}` : ''}`;
		return this.client.request('GET', url);
	}
}

export interface DeployLogEntry {
	id: number;
	deployId: number;
	timestamp: string;
	level: 'info' | 'warn' | 'error' | 'debug';
	phase: string | null;
	message: string;
}
