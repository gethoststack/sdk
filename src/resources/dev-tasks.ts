import type { HostStack, IdInput } from '../client.ts';
import type { CreateDevTaskInput, DevTask, UpdateDevTaskInput } from '../types.ts';

/**
 * The per-project agent task backlog behind a dev box - the same list the
 * dashboard's Development → Tasks surface reads and writes.
 *
 * A task is a written prompt, not a running agent: `create` files it as an
 * `idea`, and starting it is a separate, deliberate step. That split is the
 * point of the backlog - you can queue work for a box that is asleep, or for a
 * box you do not have open, and it is still there when someone opens it.
 *
 * Until this resource existed the only programmatic way in was
 * {@link ErrorsResource.fix}, which authors a task FROM an error issue. Work
 * that did not come from an exception - a coverage gap, a follow-up another
 * service is waiting on - had no route in at all except a hand-rolled request.
 *
 * @example
 * ```ts
 * await client.devTasks.create(team, {
 *   projectId: 26,
 *   serviceId: 51,
 *   title: 'Footprint coverage: run the spatial fallback for the unmatched buildings',
 *   body: 'The BBRUUID join returns 17 of 49 …',
 * });
 * ```
 */
export class DevTasksResource {
	constructor(private client: HostStack) {}

	/**
	 * The backlog for one project, newest-first within the runner's own order.
	 *
	 * `automodeEnabled` reports whether this deployment will actually START a
	 * queued task on its own; it is a property of the server, not of the task,
	 * and it is why a queued task can sit still on one install and run on
	 * another.
	 */
	async list(
		teamId: IdInput,
		projectId: IdInput,
	): Promise<{ tasks: DevTask[]; automodeEnabled: boolean }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const pid = await this.client.resolveId(projectId, { kind: 'project', teamId: tid });
		return this.client.request('GET', `/api/dev-env-tasks/${tid}?projectId=${pid}`);
	}

	/** Open task count per dev box, for the whole team in one request. */
	async counts(teamId: IdInput): Promise<{ counts: Record<string, number> }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/dev-env-tasks/${tid}/counts`);
	}

	/** One task, by `task_…` public id or numeric id. */
	async get(teamId: IdInput, taskId: IdInput): Promise<{ task: DevTask }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const id = await this.client.resolveId(taskId, { kind: 'devTask', teamId: tid });
		return this.client.request('GET', `/api/dev-env-tasks/${tid}/${id}`);
	}

	/**
	 * File a task. `serviceId` pins it to a dev box; leave it out and it is a
	 * loose idea in the project's backlog.
	 */
	async create(teamId: IdInput, data: CreateDevTaskInput): Promise<{ task: DevTask }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/dev-env-tasks/${tid}`, data);
	}

	/**
	 * Edit a task, or move it between the two statuses a PERSON may set:
	 * `done` when the work landed (by hand or in another branch), `idea` to
	 * reopen it. Everything else on the lifecycle belongs to the runner.
	 */
	async update(
		teamId: IdInput,
		taskId: IdInput,
		data: UpdateDevTaskInput,
	): Promise<{ task: DevTask }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const id = await this.client.resolveId(taskId, { kind: 'devTask', teamId: tid });
		return this.client.request('PATCH', `/api/dev-env-tasks/${tid}/${id}`, data);
	}

	/** Delete a task outright. Prefer `update(..., { status: 'done' })`, which keeps the provenance. */
	async delete(teamId: IdInput, taskId: IdInput): Promise<{ success: boolean }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const id = await this.client.resolveId(taskId, { kind: 'devTask', teamId: tid });
		return this.client.request('DELETE', `/api/dev-env-tasks/${tid}/${id}`);
	}
}
