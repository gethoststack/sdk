import type { HostStack, IdInput } from '../client.ts';
import type { AddDomainInput, Domain, UpdateDomainInput } from '../types.ts';

export class DomainsResource {
	constructor(private client: HostStack) {}

	/** List all domains for the active team. */
	async list(teamId: IdInput): Promise<{ domains: Domain[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/domains/${tid}`);
	}

	/**
	 * Add a custom domain.
	 *
	 * The returned domain may carry a `delegationWarning`: HostStack hosts the
	 * DNS zone for this apex and wrote the records, but the registry still
	 * points the apex at another host, so verification can never pass until the
	 * nameservers are changed at the registrar. Relay it — the bare `pending`
	 * status underneath looks identical to a domain that is simply propagating.
	 */
	async add(
		teamId: IdInput,
		data: AddDomainInput,
	): Promise<{ domain: Domain & { dnsSyncWarning?: string; delegationWarning?: string } }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(data.serviceId, { kind: 'service', teamId: tid });
		return this.client.request('POST', `/api/domains/${tid}`, { ...data, serviceId: sid });
	}

	/** Update a domain. */
	async update(
		teamId: IdInput,
		domainId: IdInput,
		data: UpdateDomainInput,
	): Promise<{ domain: Domain }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(domainId, { kind: 'domain', teamId: tid });
		return this.client.request('PATCH', `/api/domains/${tid}/${did}`, data);
	}

	/** Remove a domain. */
	async remove(teamId: IdInput, domainId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(domainId, { kind: 'domain', teamId: tid });
		return this.client.request('DELETE', `/api/domains/${tid}/${did}`);
	}

	/**
	 * Verify domain DNS configuration.
	 *
	 * Returns the domain as it stands AFTER the check — read `status` to see
	 * whether it passed. It was previously typed `void`, which threw away the
	 * response the route has always returned and left callers to re-list and
	 * guess.
	 *
	 * `delegationWarning` is present when the check failed for a reason no
	 * amount of retrying will fix: HostStack hosts the zone for this apex, so
	 * the records are ours and correct, but the registry still delegates the
	 * apex somewhere else — so nothing that queries this hostname ever reaches
	 * us. The fix is at the registrar, not here. Surface it verbatim instead of
	 * reporting a bare `pending`.
	 *
	 * `dnsSyncWarning` is the other unretryable failure, and it is on OUR side:
	 * the record HostStack auto-creates for this hostname could not be published
	 * to the nameservers — most often because it collides with a record already
	 * there. Same rule as above: report it rather than a bare `pending`, which
	 * sends people to re-check DNS that was never the problem.
	 */
	async verify(
		teamId: IdInput,
		domainId: IdInput,
	): Promise<{ domain: Domain & { delegationWarning?: string; dnsSyncWarning?: string } }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(domainId, { kind: 'domain', teamId: tid });
		return this.client.request('POST', `/api/domains/${tid}/${did}/verify`);
	}
}
