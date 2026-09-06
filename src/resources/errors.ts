import type { HostStack, IdInput } from '../client.ts';

/**
 * Error tracking — exceptions your application reported, grouped by cause.
 *
 * Note what is NOT here: sending an error. Reporting uses a separate,
 * write-only per-service ingest key posted to `/api/ingest/errors/<key>`, and
 * deliberately does not go through this SDK. That credential ships inside your
 * application — in a browser bundle it is world-readable by construction — so
 * it must not be the same key that can read and change everything else on the
 * team. Use `createIngestKey` below to mint one, then post to the documented
 * HTTP endpoint from your app.
 */

export type ErrorIssueStatus = 'unresolved' | 'resolved' | 'ignored';

export interface ErrorIssue {
	id: number;
	publicId: string;
	serviceId: number;
	serviceName: string | null;
	/** Stable group key: exception class + normalised message + top in-app frame. */
	fingerprint: string;
	type: string;
	title: string;
	/** The topmost stack frame in your own code — the line to open first. */
	culprit: string | null;
	level: string;
	status: ErrorIssueStatus;
	/** Exact. Not a sample count. */
	occurrenceCount: number;
	/** Counted but not stored, because the service was over its hourly quota. */
	droppedCount: number;
	/** Distinct users, capped at 500 — a value of 500 means "500 or more". */
	affectedUsers: number;
	firstSeenAt: string;
	lastSeenAt: string;
	firstSeenRelease: string | null;
	lastSeenRelease: string | null;
	environment: string | null;
	platform: string | null;
	resolvedAt: string | null;
	resolvedInRelease: string | null;
	/** A dev-box agent task already open for this issue, if any. */
	sourceTaskPublicId: string | null;
}

export interface ErrorOccurrence {
	id: number;
	stack: string | null;
	context: Record<string, unknown> | null;
	requestId: string | null;
	release: string | null;
	environment: string | null;
	createdAt: string;
}

export interface IngestKey {
	id: number;
	publicId: string;
	serviceId: number;
	name: string;
	prefix: string;
	lastUsedAt: string | null;
	createdAt: string;
	/** Present ONLY in the create response. It is never stored or shown again. */
	key?: string;
}

export interface ListErrorIssuesOptions {
	serviceId?: number;
	/** Defaults to `unresolved` server-side — the list answers "what is broken". */
	status?: ErrorIssueStatus;
	/** Substring match on title or culprit. */
	q?: string;
	limit?: number;
	offset?: number;
	sort?: 'last_seen' | 'first_seen' | 'count';
}

export class ErrorsResource {
	constructor(private client: HostStack) {}

	/** Grouped issues for the team, newest activity first. */
	async listIssues(
		teamId: IdInput,
		options: ListErrorIssuesOptions = {},
	): Promise<{ issues: ErrorIssue[]; total: number }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(options)) {
			if (value !== undefined) query.set(key, String(value));
		}
		const suffix = query.size > 0 ? `?${query.toString()}` : '';
		return this.client.request('GET', `/api/errors/${tid}/issues${suffix}`);
	}

	/** One issue. */
	async getIssue(teamId: IdInput, issueId: number): Promise<{ issue: ErrorIssue }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/errors/${tid}/issues/${issueId}`);
	}

	/**
	 * Stored samples for an issue, newest first.
	 *
	 * These are samples, not the full history: counts stay exact while a
	 * bounded number of occurrences is retained per issue, and they age out
	 * after 30 days while the issue itself stays.
	 */
	async listOccurrences(
		teamId: IdInput,
		issueId: number,
		limit = 20,
	): Promise<{ occurrences: ErrorOccurrence[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request(
			'GET',
			`/api/errors/${tid}/issues/${issueId}/occurrences?limit=${limit}`,
		);
	}

	/**
	 * Resolve, ignore or reopen an issue.
	 *
	 * Resolving records the release it was resolved in, so a later occurrence
	 * is reported as a regression rather than as ordinary noise. Ignoring keeps
	 * counting and stops telling you — an ignored issue never reopens itself.
	 */
	async updateIssue(
		teamId: IdInput,
		issueId: number,
		status: ErrorIssueStatus,
	): Promise<{ issue: ErrorIssue }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('PATCH', `/api/errors/${tid}/issues/${issueId}`, { status });
	}

	/**
	 * Hand an issue to a coding agent in this project's dev box.
	 *
	 * Writes a task carrying the exception, the stack with your own frames
	 * marked, the release and a real request — it does not start the agent.
	 * Refused with 422 when the cause is not attributable to your repository
	 * (every frame in a dependency, no usable stack, a browser extension).
	 */
	async fixInDevBox(
		teamId: IdInput,
		issueId: number,
		options: { serviceId?: number } = {},
	): Promise<{
		task: { publicId: string; title: string; body: string };
		alreadyExisted: boolean;
		box: { serviceId: number; name: string; asleep: boolean };
		automodeEnabled: boolean;
	}> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/dev-env-tasks/${tid}/from-issue`, {
			issueId,
			...options,
		});
	}

	// --- Ingest keys -------------------------------------------------------

	/** The service's ingest keys. Hashes only — the key itself is never re-shown. */
	async listIngestKeys(teamId: IdInput, serviceId: IdInput): Promise<{ keys: IngestKey[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('GET', `/api/services/${tid}/${sid}/ingest-keys`);
	}

	/**
	 * Mint a write-only ingest key for a service.
	 *
	 * The plaintext key is in `key` on the response and exists nowhere else —
	 * store it wherever your application reads it from before discarding the
	 * response.
	 */
	async createIngestKey(
		teamId: IdInput,
		serviceId: IdInput,
		name = 'default',
	): Promise<{ key: IngestKey }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('POST', `/api/services/${tid}/${sid}/ingest-keys`, { name });
	}

	/** Revoke a key. It stops working immediately. */
	async deleteIngestKey(
		teamId: IdInput,
		serviceId: IdInput,
		keyId: number,
	): Promise<{ success: boolean }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('DELETE', `/api/services/${tid}/${sid}/ingest-keys/${keyId}`);
	}
}
