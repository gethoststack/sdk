import type { HostStack, IdInput } from '../client.ts';

/**
 * Uptime checks — HostStack requesting a public URL on a schedule and telling
 * the team when it stops answering.
 *
 * A check targets either a SERVICE (`get`/`upsert`/`remove`) or an analytics
 * SITE (`getForSite`/`upsertForSite`/`removeForSite`). The site form is for a
 * site HostStack does not host: it is the one observability capability such a
 * site cannot provide for itself, since analytics is a script tag and error
 * reporting is an HTTP POST, but an outside-in probe has to come from
 * outside.
 *
 * The probe runs from the control plane against the public URL, not from the
 * server against the container. That is the whole point: a container can be
 * healthy while DNS, TLS, the edge or a route is broken, and it is the only
 * vantage point that catches a service which accepts the connection and then
 * answers nothing.
 */

/**
 * `unknown` before the first probe. `unresolvable` when there is no host to
 * request — the service has no active domain, or the site's domain ownership
 * is not proven (an unproven site is never probed). `paused` when the service is not meant to be
 * answering (suspended, mid-deploy, never deployed) or when checking it would
 * change what is measured — a service that sleeps when idle would be woken by
 * its own check, so it is left alone.
 */
export type UptimeCheckStatus = 'unknown' | 'up' | 'down' | 'unresolvable' | 'paused';

export interface UptimeCheck {
	id: number;
	publicId: string;
	/** Set for a service check; null for a site check. Exactly one of the two. */
	serviceId: number | null;
	/** Set for a site check; null for a service check. */
	siteId: number | null;
	enabled: boolean;
	/**
	 * Path only — the host is resolved at probe time (the service's primary
	 * domain, or the site's proven domain), so moving a service to a new domain
	 * moves its check with it.
	 */
	path: string;
	method: string;
	expectedStatus: number;
	timeoutMs: number;
	intervalSeconds: number;
	failureThreshold: number;
	status: string;
	consecutiveFailures: number;
	lastCheckedAt: string | null;
	lastStatusCode: number | null;
	lastLatencyMs: number | null;
	lastError: string | null;
	lastChangedAt: string | null;
}

export interface UpsertUptimeCheckInput {
	enabled?: boolean;
	path?: string;
	/** GET or HEAD only — a probe fires unattended forever, so it must be safe to repeat. */
	method?: 'GET' | 'HEAD';
	expectedStatus?: number;
	timeoutMs?: number;
	/** 30–3600 seconds. */
	intervalSeconds?: number;
	/** Consecutive failures before you are told. One failure is usually a restart. */
	failureThreshold?: number;
}

export class UptimeResource {
	constructor(private client: HostStack) {}

	/** The service's check, or null when none is configured. */
	async get(teamId: IdInput, serviceId: IdInput): Promise<{ check: UptimeCheck | null }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('GET', `/api/services/${tid}/${sid}/uptime-check`);
	}

	/**
	 * Create or update the check.
	 *
	 * Changing its shape resets the accumulated state: a check whose path or
	 * expected status just changed has not observed the NEW check failing, and
	 * carrying failures forward would alert on something never measured.
	 *
	 * Only service types with a public URL can be checked (`web_service`,
	 * `static_site`); anything else is refused with 400.
	 */
	async upsert(
		teamId: IdInput,
		serviceId: IdInput,
		input: UpsertUptimeCheckInput = {},
	): Promise<{ check: UptimeCheck }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('PUT', `/api/services/${tid}/${sid}/uptime-check`, input);
	}

	/** Stop checking this service. */
	async remove(teamId: IdInput, serviceId: IdInput): Promise<{ success: boolean }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('DELETE', `/api/services/${tid}/${sid}/uptime-check`);
	}

	/** The site's check, or null when none is configured. */
	async getForSite(teamId: IdInput, siteId: number): Promise<{ check: UptimeCheck | null }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/analytics/${tid}/sites/${siteId}/uptime-check`);
	}

	/**
	 * Create or update the check on a site HostStack does not host.
	 *
	 * The site's domain must be PROVEN first — either linked to a domain this
	 * team verified on a service, or verified directly with
	 * `analytics.verifyDomain`. An unproven target is refused with 400, because
	 * this makes the control plane fetch the hostname every interval forever
	 * from HostStack's own IP; without ownership proof that is a general-purpose
	 * request-forwarder rather than a monitor.
	 */
	async upsertForSite(
		teamId: IdInput,
		siteId: number,
		input: UpsertUptimeCheckInput = {},
	): Promise<{ check: UptimeCheck }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request(
			'PUT',
			`/api/analytics/${tid}/sites/${siteId}/uptime-check`,
			input,
		);
	}

	/** Stop checking this site. */
	async removeForSite(teamId: IdInput, siteId: number): Promise<{ success: boolean }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('DELETE', `/api/analytics/${tid}/sites/${siteId}/uptime-check`);
	}
}
