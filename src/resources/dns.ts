import type { HostStack, IdInput } from '../client.ts';
import type { DnsRecordType } from '../types.ts';

/**
 * An authoritative DNS zone hosted on HostStack's PowerDNS infrastructure.
 * The zone is the apex domain (e.g. `example.com`) under which records live.
 */
export interface DnsZone {
	id: number;
	publicId: string;
	domainName: string;
	status: string;
	nsRecords?: string[];
	provider?: string;
	createdAt?: string;
	/**
	 * Whether the parent registry actually delegates this apex to us, as of
	 * `delegationCheckedAt`.
	 *
	 * `status` above describes the zone ON OUR SIDE: `active` means PowerDNS
	 * holds it and answers for it. It says nothing about whether the world is
	 * being sent here, and the two are independent — an `active` zone whose
	 * registry still points at the customer's previous host serves nobody while
	 * looking perfect from every other angle.
	 *
	 * Three values, not two. `unknown` means the lookup produced no usable
	 * answer (SERVFAIL, timeout, or never checked); it is NOT `foreign`, and
	 * rendering it as one tells a customer to go change a registrar that may
	 * already be correct.
	 */
	delegationStatus?: 'delegated' | 'foreign' | 'unknown';
	/** The NS hostnames the parent actually publishes — who the traffic goes to today. */
	delegationObservedNs?: string[];
	/** When the delegation was last read. `null`/absent → never. */
	delegationCheckedAt?: string | null;
	/**
	 * What the REGISTRY says about the REGISTRATION, from the daily RDAP sweep.
	 *
	 * The delegation fields answer "is the world being sent here?". These
	 * answer "is this domain still going to be theirs next month?" — and a
	 * domain can be correctly delegated, perfectly served and thirty days from
	 * being released to anybody, which is how this became a field at all.
	 *
	 * Absent means the sweep has not reached this zone. A null `registrar` or
	 * `registryExpiresAt` on a zone it HAS reached means the registry publishes
	 * neither — DENIC publishes no expiry and no registrar for any `.de` — and
	 * must never be read as "no expiry".
	 */
	/** Sponsoring registrar, where the TLD discloses one (DENIC does not). */
	registrar?: string | null;
	/** EPP status codes, camelCase: `clientHold`, `pendingDelete`, … */
	registryStatus?: string[];
	/** Registry expiry where published. null means the registry does not say. */
	registryExpiresAt?: string | null;
	/** `ok` | `not_found` | `unsupported` | `rate_limited` | `error`. */
	registryCheckOutcome?: string | null;
	registryCheckedAt?: string | null;
	/** The registry's own "last changed" event, not its mirror refresh. */
	registryLastChangedAt?: string | null;
}

/** One reading of a zone's delegation, from {@link DnsResource.checkDelegation}. */
export interface DelegationCheck {
	status: 'delegated' | 'foreign' | 'unknown';
	/** NS hostnames the parent registry publishes right now. */
	observedNameservers: string[];
	/** NS hostnames it should publish — HostStack's. */
	expectedNameservers: string[];
	checkedAt: string;
}

/** A single DNS record within a hosted zone. */
export interface DnsRecord {
	id: number;
	publicId: string;
	zoneId: number;
	type: DnsRecordType;
	name: string;
	value: string;
	ttl?: number;
	priority?: number | null;
	status?: string;
	managedBy?: string;
	createdAt?: string;
}

/** Payload for creating or updating a DNS record. */
export interface UpsertDnsRecordInput {
	type: DnsRecordType;
	/** `@` for the zone apex, or a bare label (`www`, `_acme-challenge`). */
	name: string;
	/** The record value; TXT values are passed unquoted. */
	value: string;
	/** TTL in seconds (60–86400). Defaults to 3600 server-side. */
	ttl?: number;
	/** Required for MX and SRV records (0–65535). */
	priority?: number;
	comment?: string;
}

/**
 * Manage authoritative DNS zones and their records. Wraps the same
 * `/api/dns-zones/:teamId/...` routes the dashboard uses, so tenancy,
 * audit logging, PowerDNS sync, and idempotency all match exactly.
 *
 * Zones and records are addressed by their `publicId` (`dnz_…` / `dnr_…`),
 * not a numeric id — these routes nest records under their zone publicId.
 */
export class DnsResource {
	constructor(private client: HostStack) {}

	/** List the authoritative DNS zones the team owns. */
	async listZones(teamId: IdInput): Promise<{ zones: DnsZone[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/dns-zones/${tid}`);
	}

	/**
	 * Read the parent registry's delegation for this zone, live, and store the
	 * result on the zone.
	 *
	 * `listZones` already returns the last reading (refreshed hourly), which is
	 * the right resolution for something that changes once a year. Call this
	 * when the answer needs to be current to the second — right after a
	 * registrar change, or before telling someone a cutover is done.
	 */
	async checkDelegation(
		teamId: IdInput,
		zonePublicId: string,
	): Promise<{ delegation: DelegationCheck }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request(
			'POST',
			`/api/dns-zones/${tid}/${zonePublicId}/delegation/check`,
		);
	}

	/**
	 * Claim a hosted zone for `domain`. The zone is created in PowerDNS and the
	 * team must delegate NS to ns1/ns2.hoststack.dev to make it authoritative.
	 */
	async createZone(teamId: IdInput, domain: string): Promise<{ zone: DnsZone }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/dns-zones/${tid}`, { domain });
	}

	/** Delete a hosted zone (and all its records). */
	async deleteZone(teamId: IdInput, zonePublicId: string): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('DELETE', `/api/dns-zones/${tid}/${zonePublicId}`);
	}

	/** List every record in a hosted zone. */
	async listRecords(teamId: IdInput, zonePublicId: string): Promise<{ records: DnsRecord[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/dns-zones/${tid}/${zonePublicId}/records`);
	}

	/** Create a DNS record on a hosted zone. Idempotent for an identical tuple. */
	async createRecord(
		teamId: IdInput,
		zonePublicId: string,
		data: UpsertDnsRecordInput,
	): Promise<{ record: DnsRecord }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/dns-zones/${tid}/${zonePublicId}/records`, data);
	}

	/**
	 * Update a DNS record by its publicId. Full-replace (PUT) semantics — every
	 * mutable field must be provided.
	 */
	async updateRecord(
		teamId: IdInput,
		zonePublicId: string,
		recordPublicId: string,
		data: UpsertDnsRecordInput,
	): Promise<{ record: DnsRecord }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request(
			'PUT',
			`/api/dns-zones/${tid}/${zonePublicId}/records/${recordPublicId}`,
			data,
		);
	}

	/** Soft-delete a DNS record and remove it from PowerDNS. */
	async deleteRecord(
		teamId: IdInput,
		zonePublicId: string,
		recordPublicId: string,
	): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request(
			'DELETE',
			`/api/dns-zones/${tid}/${zonePublicId}/records/${recordPublicId}`,
		);
	}

	/**
	 * Re-push a record to the provider without changing its value. Recovers a
	 * row left `status: "failed"` by a provider outage — including
	 * `managedBy: "hoststack"` records the edit APIs refuse to touch.
	 */
	async resyncRecord(
		teamId: IdInput,
		zonePublicId: string,
		recordPublicId: string,
	): Promise<{ record: DnsRecord }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request(
			'POST',
			`/api/dns-zones/${tid}/${zonePublicId}/records/${recordPublicId}/resync`,
		);
	}
}
