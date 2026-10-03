import type { HostStack, IdInput } from '../client.ts';

/**
 * Site analytics — cookieless traffic for the domains a team owns.
 *
 * Note what is NOT here: recording an event. That uses a separate, write-only
 * site key posted to `/api/track/<key>/event`, and deliberately does not go
 * through this SDK. The site key ships inside a web page where it is
 * world-readable by construction, so it must never be the same credential that
 * can read and change everything else on the team.
 */

export type AnalyticsRange = '24h' | '7d' | '30d' | '90d' | '12mo';

export interface AnalyticsSite {
	id: number;
	publicId: string;
	name: string;
	domain: string;
	/** Public by design — it ships in a `data-site-key` attribute. */
	ingestKey: string;
	/** Still accepted until `keyGraceEndsAt`, after a rotation. */
	previousIngestKey: string | null;
	keyRotatedAt: string | null;
	keyGraceEndsAt: string | null;
	allowedOrigins: string[];
	serviceId: number | null;
	serviceName: string | null;
	domainId: number | null;
	domainVerified: boolean;
	/**
	 * True when the team has proven this domain by EITHER route: a linked
	 * `domains` row verified on a service, or the site's own TXT challenge.
	 * This is the flag that gates an uptime check — `domainVerified` describes
	 * only the link, which a site with no service can never have.
	 */
	domainProven: boolean;
	/** When the standalone TXT proof first succeeded, if it ever did. */
	verifiedAt: string | null;
	/** Days of raw events kept; longer ranges are answered from the rollup. */
	retentionDays: number;
	/** Events refused by the hourly quota, and therefore missing from counts. */
	droppedCount: number;
	/**
	 * Newest event stored for this site, or null when none ever was.
	 *
	 * The cheap half of "did my setup work". Ingest answers 204 to a wrong key
	 * exactly as it does to a right one — deliberately, so the endpoint cannot
	 * be used to enumerate keys — which left "send traffic and watch the chart"
	 * as the only check anyone had, and that check cannot tell a working site
	 * with no visitors from a broken one. Use `siteStatus()` for the full
	 * diagnosis.
	 */
	lastEventAt: string | null;
	lastRefusalAt: string | null;
	lastRefusalReason: AnalyticsRefusalReason | null;
	/** Refusals over the last seven days, by reason. */
	refusedRecently: AnalyticsRefusalCounts;
	createdAt: string;
}

export type AnalyticsRefusalReason = 'unknown_key' | 'bad_origin' | 'bot' | 'over_quota';
export type AnalyticsRefusalCounts = Record<AnalyticsRefusalReason, number>;

/**
 * `receiving` — events are landing. `refusing` — they arrive and are turned
 * away. `quiet` — it worked once and has gone silent. `never` — nothing has
 * ever reached ingest for this key, so the request is not leaving the browser.
 */
export type AnalyticsSiteHealth = 'receiving' | 'quiet' | 'refusing' | 'never';

export interface AnalyticsSiteStatus {
	siteId: number;
	publicId: string;
	name: string;
	domain: string;
	/** The key the snippet must carry. Compare it against the deployed HTML. */
	ingestKey: string;
	previousIngestKey: string | null;
	keyGraceEndsAt: string | null;
	allowedOrigins: string[];
	lastEventAt: string | null;
	lastRefusalAt: string | null;
	lastRefusalReason: AnalyticsRefusalReason | null;
	/** The `Origin` header on that refusal, when the caller sent one. */
	lastRefusalOrigin: string | null;
	refusedRecently: AnalyticsRefusalCounts;
	/**
	 * Which origins were turned away for `bad_origin`, and how often, over the
	 * same 7-day window. `lastRefusalOrigin` is only the newest refusal of any
	 * reason, so it names the wrong thing whenever a bot refusal came later.
	 */
	refusedOrigins: Record<string, number>;
	droppedCount: number;
	quota: { usedThisHour: number; limitPerHour: number; hourResetsAt: string };
	health: AnalyticsSiteHealth;
	/** One sentence naming the situation. */
	headline: string;
	/** What to do about it. */
	detail: string;
	checkedAt: string;
}

export interface AnalyticsMetricWindow {
	pageviews: number;
	visitors: number;
	bounceRate: number | null;
	avgDurationMs: number | null;
}

export interface AnalyticsSiteSummary {
	siteId: number;
	publicId: string;
	name: string;
	domain: string;
	current: AnalyticsMetricWindow;
	previous: AnalyticsMetricWindow;
	/** Visitors in the last five minutes. */
	live: number;
	/**
	 * True when `visitors` is each day's uniques added together rather than a
	 * distinct count over the range — which is the case for any range past the
	 * site's raw-event retention. Check it before quoting the number.
	 */
	visitorsAreSummedDailies: boolean;
}

export interface AnalyticsOverview {
	range: AnalyticsRange;
	siteIds: number[];
	source: 'raw' | 'rollup';
	visitorsAreSummedDailies: boolean;
	filtersSupported: boolean;
	summary: { current: AnalyticsMetricWindow; previous: AnalyticsMetricWindow };
	timeseries: { bucket: string; pageviews: number; visitors: number }[];
	topPaths: { path: string; pageviews: number }[];
	topReferrers: { referrer: string; visits: number }[];
	topEvents: { eventType: string; count: number }[];
	topBrowsers: { browser: string; count: number }[];
	topOs: { os: string; count: number }[];
	topLanguages: { language: string; count: number }[];
	topScreens: { screen: string; count: number }[];
	topCampaigns: { campaign: string; count: number }[];
	devices: { key: string; count: number }[];
	countries: { key: string; count: number }[];
}

export interface AnalyticsQueryOptions {
	/** Omit for every site the team owns. */
	siteIds?: number[];
	range?: AnalyticsRange;
	/** Only applied inside the raw-event window; see `filtersSupported`. */
	filters?: Record<string, string>;
}

function query(options: AnalyticsQueryOptions): string {
	const params = new URLSearchParams();
	if (options.siteIds?.length) params.set('siteIds', options.siteIds.join(','));
	if (options.range) params.set('range', options.range);
	for (const [key, value] of Object.entries(options.filters ?? {})) {
		if (value) params.set(key, value);
	}
	const qs = params.toString();
	return qs ? `?${qs}` : '';
}

export class AnalyticsResource {
	constructor(private client: HostStack) {}

	/** Every site this team tracks. */
	async listSites(teamId: IdInput): Promise<{ sites: AnalyticsSite[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/analytics/${tid}/sites`);
	}

	/**
	 * Start tracking a domain.
	 *
	 * If the domain is already attached to a service on this team, the site
	 * links itself to that service. A domain hosted elsewhere works the same
	 * way, minus the link.
	 */
	async createSite(
		teamId: IdInput,
		input: { domain: string; name?: string; serviceId?: number; retentionDays?: number },
	): Promise<AnalyticsSite> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/analytics/${tid}/sites`, input);
	}

	async updateSite(
		teamId: IdInput,
		siteId: number,
		input: {
			name?: string;
			serviceId?: number | null;
			retentionDays?: number;
			allowedOrigins?: string[];
		},
	): Promise<AnalyticsSite> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('PATCH', `/api/analytics/${tid}/sites/${siteId}`, input);
	}

	/**
	 * Is this site actually working?
	 *
	 * Answers without generating traffic, which was previously the only way to
	 * find out: whether anything has ever arrived, when the last event landed,
	 * what has been refused and why, and how much of the hourly quota is spent.
	 * Safe to be this specific because it needs a real session or API key — the
	 * silence on the public ingest endpoint exists to defeat an enumerator, and
	 * an enumerator does not have one.
	 */
	async siteStatus(teamId: IdInput, siteId: number): Promise<AnalyticsSiteStatus> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/analytics/${tid}/sites/${siteId}/status`);
	}

	/**
	 * Issue a new site key. The previous one keeps working for 30 days, so
	 * rotating is never an outage — deploy the new snippet inside that window.
	 */
	async rotateKey(teamId: IdInput, siteId: number): Promise<AnalyticsSite> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/analytics/${tid}/sites/${siteId}/rotate-key`);
	}

	/**
	 * The TXT record that proves this team owns the site's domain.
	 *
	 * Analytics needs no proof — the ingest key only labels events the site
	 * posts about itself. This gates the capabilities where the PLATFORM acts on
	 * the hostname, starting with uptime checks. Idempotent: the token is stable
	 * across calls, so re-reading it mid-paste is safe.
	 */
	async getDomainProof(
		teamId: IdInput,
		siteId: number,
	): Promise<{
		recordName: string;
		recordType: 'TXT';
		recordValue: string;
		verified: boolean;
		lastVerificationAt: string | null;
	}> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/analytics/${tid}/sites/${siteId}/verification`);
	}

	/**
	 * Read DNS now and record the verdict.
	 *
	 * The record is read from the domain's own authoritative nameservers rather
	 * than through a cache, so a record that was just published is visible
	 * immediately instead of being masked by a negative-cache TTL.
	 *
	 * `verified: false` is a successful check with a negative answer, not an
	 * error. A DNS failure never revokes a proof that already succeeded.
	 */
	async verifyDomain(
		teamId: IdInput,
		siteId: number,
	): Promise<{ verified: boolean; detail?: string }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/analytics/${tid}/sites/${siteId}/verify`, {});
	}

	/** Delete a site and every event and rollup row recorded for it. */
	async deleteSite(teamId: IdInput, siteId: number): Promise<{ success: boolean }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('DELETE', `/api/analytics/${tid}/sites/${siteId}`);
	}

	/**
	 * One row per site — the cross-site comparison.
	 *
	 * Visitors are reported per site and never summed into a cross-site total:
	 * the same person on two of your domains is two visitors, and joining them
	 * would require the cross-domain identity this tracker exists not to build.
	 */
	async summary(
		teamId: IdInput,
		options: AnalyticsQueryOptions = {},
	): Promise<{ range: AnalyticsRange; sites: AnalyticsSiteSummary[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/analytics/${tid}/summary${query(options)}`);
	}

	/** The full breakdown for one site, several, or all of them. */
	async overview(
		teamId: IdInput,
		options: AnalyticsQueryOptions = {},
	): Promise<AnalyticsOverview> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/analytics/${tid}/overview${query(options)}`);
	}

	/** Visitors in the last five minutes. */
	async realtime(
		teamId: IdInput,
		options: Pick<AnalyticsQueryOptions, 'siteIds'> = {},
	): Promise<{ siteIds: number[]; visitors: number }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/analytics/${tid}/realtime${query(options)}`);
	}

	/** Top metadata key/value pairs recorded with a custom event. */
	async eventMetadata(
		teamId: IdInput,
		eventType: string,
		options: AnalyticsQueryOptions = {},
	): Promise<{
		siteIds: number[];
		eventType: string;
		range: AnalyticsRange;
		rows: { key: string; value: string; count: number }[];
	}> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const qs = query(options);
		const sep = qs ? '&' : '?';
		return this.client.request(
			'GET',
			`/api/analytics/${tid}/event-metadata${qs}${sep}eventType=${encodeURIComponent(eventType)}`,
		);
	}
}
