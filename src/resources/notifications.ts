import type { HostStack, IdInput } from '../client.ts';

export type NotificationChannelType = 'slack' | 'discord' | 'email';

/**
 * Events a notification channel can subscribe to. Source of truth is
 * `packages/shared/src/schemas/notification-channel.ts:NOTIFICATION_CHANNEL_EVENTS`;
 * `shared-guard.ts` fails the typecheck if this copy drifts from it.
 *
 * The copy exists because `@hoststack/shared` is `private: true` — importing it
 * from anything the published `.d.ts` reaches would leave consumers with an
 * unresolvable type — so the values are duplicated and the guard, which is not
 * exported, does the comparing.
 */
export type NotificationChannelEvent =
	| 'deploy.started'
	| 'deploy.succeeded'
	| 'deploy.failed'
	| 'deploy.failed_consecutive'
	| 'service.created'
	| 'service.deleted'
	| 'service.suspended'
	| 'service.resumed'
	| 'service.restart_failed'
	| 'service.no_running_container'
	| 'service.health_check_failed'
	| 'service.acme_cert_failed'
	| 'service.resource_alert'
	| 'service.pressure_sustained'
	| 'service.pressure_recovered'
	| 'service.uptime_down'
	| 'service.uptime_recovered'
	| 'watchdog.reported_down'
	| 'watchdog.reported_recovered'
	| 'watchdog.silent'
	| 'error.issue_new'
	| 'error.issue_regressed'
	| 'git.auth_failed'
	| 'cron.execution_failed'
	| 'workflow.failed'
	| 'devenv.agent.needs_input'
	| 'devenv.agent.finished'
	| 'devenv.task.created'
	| 'devenv.task.needs_input'
	| 'devenv.task.finished'
	| 'database.backup_failed'
	| 'database.restore_failed'
	| 'machine.offline'
	| 'machine.online'
	| 'billing.invoice'
	| 'billing.payment_failed'
	| 'billing.spend_limit';

export interface NotificationChannel {
	id: number;
	teamId: number;
	type: NotificationChannelType;
	name: string;
	/**
	 * Webhook URL (Slack/Discord) or email address. The list API masks
	 * the value for security — only the create/update calls round-trip
	 * the real URL.
	 */
	webhookUrl: string;
	active: boolean;
	events: NotificationChannelEvent[];
	createdAt: string;
	updatedAt: string;
}

export class NotificationsResource {
	constructor(private client: HostStack) {}

	/**
	 * List notification channels for the team. Webhook URLs are
	 * server-side masked in the response so this is safe to log.
	 */
	async listChannels(teamId: IdInput): Promise<{ channels: NotificationChannel[] }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('GET', `/api/notifications/${tid}/channels`);
	}

	/**
	 * Create a Slack/Discord/email notification channel.
	 *
	 * For type=email, `webhookUrl` is the recipient email address; for
	 * type=slack/discord it's the incoming webhook URL.
	 *
	 * `events` is the explicit subscription list — an empty array means
	 * "receive nothing". The platform pre-selects the critical-event
	 * set on the dashboard, but SDK callers must pass the list
	 * explicitly so behaviour is deterministic.
	 */
	async createChannel(
		teamId: IdInput,
		data: {
			type: NotificationChannelType;
			name: string;
			webhookUrl: string;
			events: NotificationChannelEvent[];
		},
	): Promise<{ channel: NotificationChannel }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/notifications/${tid}/channels`, data);
	}

	/**
	 * Update a channel's name / active state / event subscriptions. The
	 * webhook URL and type are immutable — create a new channel if
	 * those need to change.
	 */
	async updateChannel(
		teamId: IdInput,
		channelId: number,
		data: {
			name?: string;
			active?: boolean;
			events?: NotificationChannelEvent[];
		},
	): Promise<{ channel: NotificationChannel }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request(
			'PATCH',
			`/api/notifications/${tid}/channels/${channelId}`,
			data,
		);
	}

	/** Delete a notification channel. */
	async deleteChannel(teamId: IdInput, channelId: number): Promise<void> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('DELETE', `/api/notifications/${tid}/channels/${channelId}`);
	}

	/**
	 * Fire a test event to the channel so the user can confirm the
	 * webhook is wired correctly. Returns the dispatch outcome.
	 */
	async testChannel(
		teamId: IdInput,
		channelId: number,
	): Promise<{ success: boolean; error?: string }> {
		const tid = await this.client.resolveId(teamId, { kind: 'team' });
		return this.client.request('POST', `/api/notifications/${tid}/channels/${channelId}/test`);
	}
}
