import { AuthenticationError, HostStackError, NotFoundError, RateLimitError } from './errors.ts';
import { CronResource } from './resources/cron.ts';
import { DatabasesResource } from './resources/databases.ts';
import { DeploysResource } from './resources/deploys.ts';
import { DomainsResource } from './resources/domains.ts';
import { EnvVarsResource } from './resources/env-vars.ts';
import { ProjectsResource } from './resources/projects.ts';
import { ServicesResource } from './resources/services.ts';

export interface HostStackOptions {
	/** Your HostStack API key (hs_live_... or hs_test_...). */
	apiKey: string;
	/** Base URL of the HostStack API. Defaults to https://api.hoststack.dev */
	baseUrl?: string;
}

export class HostStack {
	private apiKey: string;
	private baseUrl: string;

	/** Manage projects. */
	public readonly projects: ProjectsResource;
	/** Manage services (web, worker, cron). */
	public readonly services: ServicesResource;
	/** Trigger and manage deployments. */
	public readonly deploys: DeploysResource;
	/** Manage databases (Postgres, Redis). */
	public readonly databases: DatabasesResource;
	/** Manage custom domains. */
	public readonly domains: DomainsResource;
	/** Manage service environment variables. */
	public readonly envVars: EnvVarsResource;
	/** Manage cron job executions. */
	public readonly cron: CronResource;

	constructor(options: HostStackOptions) {
		if (!options.apiKey) {
			throw new Error('apiKey is required');
		}

		this.apiKey = options.apiKey;
		this.baseUrl = (options.baseUrl ?? 'https://api.hoststack.dev').replace(/\/$/, '');

		this.projects = new ProjectsResource(this);
		this.services = new ServicesResource(this);
		this.deploys = new DeploysResource(this);
		this.databases = new DatabasesResource(this);
		this.domains = new DomainsResource(this);
		this.envVars = new EnvVarsResource(this);
		this.cron = new CronResource(this);
	}

	/**
	 * Make an authenticated request to the HostStack API.
	 * Used internally by resource classes. Can also be used for custom API calls.
	 */
	async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const url = `${this.baseUrl}${path}`;

		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.apiKey}`,
		};

		if (body !== undefined) {
			headers['Content-Type'] = 'application/json';
		}

		const res = await fetch(url, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});

		if (!res.ok) {
			const data = (await res.json().catch(() => ({ error: 'Unknown error' }))) as {
				error?: string;
			};
			const message = data.error ?? `HTTP ${res.status}`;

			switch (res.status) {
				case 401:
					throw new AuthenticationError(message);
				case 404:
					throw new NotFoundError(message);
				case 429:
					throw new RateLimitError(message);
				default:
					throw new HostStackError(res.status, message);
			}
		}

		// Handle 204 No Content
		if (res.status === 204) {
			return undefined as T;
		}

		return res.json() as Promise<T>;
	}
}
