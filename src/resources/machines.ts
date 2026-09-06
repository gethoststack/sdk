import type { HostStack, IdInput } from '../client.ts';
import type { Machine, MachineWorkload } from '../types.ts';

/**
 * Machines the team owns and enrolled as runners — a spare desktop, a home
 * server, a VPS you already pay for.
 *
 * Read-only on purpose. Enrolling a machine mints a pairing credential that is
 * only useful to someone sitting at that machine with a terminal open, so it
 * stays in the dashboard and the CLI (`hoststack machines add`), where a person
 * is present to run the installer. What the SDK needs is the other half: which
 * machines exist, whether they are online, and the `id` to pass as `machineId`
 * when creating a service, database or dev box on one.
 *
 * @example
 * ```ts
 * const { machines } = await client.machines.list(team);
 * const desktop = machines.find((m) => m.name === 'desktop');
 * await client.services.create(team, project, { ...spec, machineId: desktop?.id });
 * ```
 */
export class MachinesResource {
	constructor(private client: HostStack) {}

	/** List the team's enrolled machines. */
	async list(teamId: IdInput): Promise<{ machines: Machine[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/machines/${tid}`);
	}

	/**
	 * One machine, with what is actually running on it — rather than the counts
	 * the list carries. Worth reading before switching a machine off: `running`
	 * is the list of things that go away with it.
	 */
	async get(
		teamId: IdInput,
		machineId: number,
	): Promise<{ machine: Machine; running: MachineWorkload[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/machines/${tid}/${machineId}`);
	}
}
