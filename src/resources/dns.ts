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
