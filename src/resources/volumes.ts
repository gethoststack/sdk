import type { HostStack, IdInput } from '../client.ts';
import type { CreateVolumeInput, UpdateVolumeInput, Volume } from '../types.ts';

/**
 * One archive of a volume that reached object storage — a point you can
 * restore to.
 *
 * Only OFF-SITE archives are listed. A bring-your-own agent with no upload
 * grant writes its tar onto the very disk it is backing up; that is not a
 * restore point in any sense worth offering, and it is not recorded here.
 */
export interface VolumeRestorePoint {
	id: number;
	volumeId: number;
	/** Object-storage address of the archive, stored verbatim as the agent reported it. */
	s3Url: string;
	archiveName: string;
	/** `null` when the agent did not report a size (older builds, multipart uploads). */
	sizeBytes: number | null;
	createdAt: string;
}

/**
 * Manage persistent disks attached to a service.
 *
 * Volumes mount a writable disk into a service's container at the path you
 * choose, surviving redeploys and container restarts. One service can have
 * multiple volumes; each one is identified by a short `name` and a
 * `mountPath`.
 *
 * Renderers porting from render.yaml: a volume here is the same concept as
 * Render's `disk:` block. Use {@link create} to attach one programmatically,
 * or declare it in `hoststack.yaml` for IaC workflows.
 *
 * @example
 * ```ts
 * await client.volumes.create(team, service, {
 *   name: 'data',
 *   mountPath: '/var/data',
 *   sizeGb: 10,
 * });
 * ```
 */
export class VolumesResource {
	constructor(private client: HostStack) {}

	/** List volumes attached to a service. */
	async list(teamId: IdInput, serviceId: IdInput): Promise<{ volumes: Volume[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('GET', `/api/services/${tid}/${sid}/volumes`);
	}

	/** Attach a new volume to a service. Triggers provisioning on the host. */
	async create(
		teamId: IdInput,
		serviceId: IdInput,
		data: CreateVolumeInput,
	): Promise<{ volume: Volume }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		return this.client.request('POST', `/api/services/${tid}/${sid}/volumes`, data);
	}

	/**
	 * Update a volume's mountPath or sizeGb. Resizes that take effect on the
	 * next deploy; mountPath changes require a redeploy to remount.
	 */
	async update(
		teamId: IdInput,
		serviceId: IdInput,
		volumeId: IdInput,
		data: UpdateVolumeInput,
	): Promise<{ volume: Volume }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const vid = await this.client.resolveId(volumeId, {
			kind: 'volume',
			teamId: tid,
			serviceId: sid,
		});
		return this.client.request('PATCH', `/api/services/${tid}/${sid}/volumes/${vid}`, data);
	}

	/**
	 * The archives this volume can be restored from, newest first.
	 *
	 * `backupEnabled` on the volume says backups are being TAKEN; this says
	 * which ones exist. The two are worth checking together — a
	 * `backupEnabled: true` with an empty restore-point list means nothing has
	 * completed yet (or the agent has no upload grant and is writing tars onto
	 * the disk it is backing up, which is not a copy of anything).
	 *
	 * Capped at the most recent few: the agent prunes older archives out of the
	 * bucket on its own schedule, and a list whose oldest entries fail when you
	 * pick them is worse than a shorter list that works.
	 */
	async listRestorePoints(
		teamId: IdInput,
		serviceId: IdInput,
		volumeId: IdInput,
	): Promise<{ restorePoints: VolumeRestorePoint[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const vid = await this.client.resolveId(volumeId, {
			kind: 'volume',
			teamId: tid,
			serviceId: sid,
		});
		return this.client.request(
			'GET',
			`/api/services/${tid}/${sid}/volumes/${vid}/restore-points`,
		);
	}

	/**
	 * Unpack an archive over this volume's contents.
	 *
	 * DESTRUCTIVE and not reversible: what is on the disk now is replaced by
	 * what was on it when the archive was taken. There is no undo and no
	 * snapshot of the pre-restore state.
	 *
	 * A volume backup is a block-level tar of a live filesystem — CRASH
	 * CONSISTENT, not application consistent. Restoring one containing a
	 * database that was mid-write gives you exactly what that database would
	 * see after a power cut: usually recoverable, occasionally not. For a
	 * container that holds its own database, a dump is the durable copy and
	 * this is the disaster fallback.
	 *
	 * Pass either `backupId` (an id from {@link listRestorePoints}) or `s3Url`
	 * (an archive uploaded through the import-upload flow).
	 */
	async restore(
		teamId: IdInput,
		serviceId: IdInput,
		volumeId: IdInput,
		source: { backupId: number } | { s3Url: string },
	): Promise<{ success: true }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const vid = await this.client.resolveId(volumeId, {
			kind: 'volume',
			teamId: tid,
			serviceId: sid,
		});
		return this.client.request(
			'POST',
			`/api/services/${tid}/${sid}/volumes/${vid}/restore`,
			source,
		);
	}

	/**
	 * Detach and deprovision a volume. The underlying disk is destroyed —
	 * back up any data first. Async: the row is marked `deleting` and the
	 * agent finalises the removal once it acks.
	 */
	async delete(teamId: IdInput, serviceId: IdInput, volumeId: IdInput): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		const sid = await this.client.resolveId(serviceId, { kind: 'service', teamId: tid });
		const vid = await this.client.resolveId(volumeId, {
			kind: 'volume',
			teamId: tid,
			serviceId: sid,
		});
		return this.client.request('DELETE', `/api/services/${tid}/${sid}/volumes/${vid}`);
	}
}
