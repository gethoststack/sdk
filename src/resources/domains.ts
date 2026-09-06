import type { HostStack, IdInput } from '../client.ts';
import type { AddDomainInput, Domain, UpdateDomainInput } from '../types.ts';

export class DomainsResource {
	constructor(private client: HostStack) {}

	/** List all domains for the active team. */
	async list(teamId: IdInput): Promise<{ domains: Domain[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/domains/${tid}`);
	}

	/** Add a custom domain. */
	async add(teamId: IdInput, data: AddDomainInput): Promise<{ domain: Domain }> {
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

	/** Verify domain DNS configuration. */
	async verify(teamId: IdInput, domainId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const did = await this.client.resolveId(domainId, { kind: 'domain', teamId: tid });
		return this.client.request('POST', `/api/domains/${tid}/${did}/verify`);
	}
}
