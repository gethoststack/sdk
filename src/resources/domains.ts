import type { HostStack } from '../client.ts';
import type { AddDomainInput, Domain, UpdateDomainInput } from '../types.ts';

export class DomainsResource {
	constructor(private client: HostStack) {}

	/** List all domains for the active team. */
	async list(teamId: number): Promise<{ domains: Domain[] }> {
		return this.client.request('GET', `/api/domains/${teamId}`);
	}

	/** Add a custom domain. */
	async add(teamId: number, data: AddDomainInput): Promise<{ domain: Domain }> {
		return this.client.request('POST', `/api/domains/${teamId}`, data);
	}

	/** Update a domain. */
	async update(
		teamId: number,
		domainId: string,
		data: UpdateDomainInput,
	): Promise<{ domain: Domain }> {
		return this.client.request('PATCH', `/api/domains/${teamId}/${domainId}`, data);
	}

	/** Remove a domain. */
	async remove(teamId: number, domainId: string): Promise<void> {
		return this.client.request('DELETE', `/api/domains/${teamId}/${domainId}`);
	}

	/** Verify domain DNS configuration. */
	async verify(teamId: number, domainId: string): Promise<void> {
		return this.client.request('POST', `/api/domains/${teamId}/${domainId}/verify`);
	}
}
