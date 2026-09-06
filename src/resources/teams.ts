import type { HostStack } from '../client.ts';
import type { Team } from '../types.ts';

export class TeamsResource {
	constructor(private client: HostStack) {}

	/**
	 * List the teams the authenticated principal can access.
	 *
	 * Session auth: all teams the user belongs to.
	 * API-key auth: the single team the key is bound to.
	 */
	async list(): Promise<{ teams: Team[] }> {
		return this.client.request('GET', '/api/auth/teams');
	}
}
