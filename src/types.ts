// --- Regions ---
// These public type unions are kept as local literals (not a re-export from
// `@hoststack/shared`) so the published `.d.ts` has no import of the private
// shared package — consumers couldn't resolve it. Drift against shared is
// caught at build time by the compile-time guards in `./shared-guard.ts`, so
// this is no longer a hand-watched "keep in sync" copy: adding a region or
// record type to shared without updating these unions fails the SDK typecheck.

/** Region identifiers accepted by every endpoint that takes a `region` input. */
export type RegionId = 'eu-central-1' | 'eu-central-2' | 'eu-west-1' | 'us-east-1';

/** DNS record types supported by hosted zones. */
export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV' | 'CAA' | 'ALIAS';

// --- Projects ---
export interface Project {
	id: number;
	publicId: string;
	name: string;
	slug: string;
	description?: string | null;
	region: RegionId;
	createdAt: string;
	updatedAt: string;
}

export interface CreateProjectInput {
	name: string;
	description?: string;
	region?: RegionId;
}

export interface UpdateProjectInput {
	name?: string;
	description?: string;
}

// --- Services ---
export type ServiceType = 'web_service' | 'private_service' | 'worker' | 'cron_job' | 'static_site';

/**
 * v89: `sleeping` is the free-tier idle state — container is `docker pause`d
 * but warm-resumes <100ms on the next request. Distinct from `suspended`
 * (admin/user action; container fully stopped, requires a deploy to revive).
 */
export type ServiceStatus =
	'active' | 'deploying' | 'suspended' | 'failed' | 'not_deployed' | 'sleeping';

/**
 * Service size tiers, in ascending order — matches the server's
 * `SERVICE_SIZE_ORDER` (pico↓xlarge are shared-CPU; the `pro_*` tiers are
 * dedicated-CPU). `small`/`large`/`xlarge` are real catalog sizes the PATCH
 * schema accepts (existing dev boxes run `large`). `starter` is NOT a service
 * size — it is a database/addon plan (see `DatabasePlan`).
 */
export type ServicePlan =
	| 'pico'
	| 'nano'
	| 'micro'
	| 'small'
	| 'standard'
	| 'large'
	| 'xlarge'
	| 'pro_standard'
	| 'pro_large';

export interface Service {
	id: number;
	publicId: string;
	name: string;
	type: ServiceType;
	status: ServiceStatus;
	internalUrl?: string | null;
	projectId: number;
	/** Size tier (memory/CPU/disk bracket), e.g. "standard" / "large". Change via `services.resize`. */
	plan?: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateServiceInput {
	name: string;
	type: ServiceType;
	projectId: number;
	/**
	 * v66 P5: bind the new service to a specific environment in the
	 * project. Omit to default to the project's Production env. Find or
	 * list envs with `client.environments.list(teamId, projectId)`.
	 */
	environmentId?: number;
	/** Connect a previously-linked GitHub repo by id. Mutually exclusive with gitlabRepoId/bitbucketRepoId/dockerImage. */
	githubRepoId?: number;
	gitlabRepoId?: number;
	bitbucketRepoId?: number;
	branch?: string;
	rootDirectory?: string;
	installCommand?: string;
	buildCommand?: string;
	startCommand?: string;
	plan?: ServicePlan;
	/** Cron expression — required when `type: 'cron_job'`. */
	cronSchedule?: string;
	/** Static-site build output path, e.g. `dist`. */
	publishPath?: string;
	/** Pre-built image to deploy instead of building from source. */
	dockerImage?: string;
	/** Runtime hint (`node`, `bun`, `python`, …). Auto-detected when omitted. */
	runtime?: string;
	/**
	 * The port the container listens on (1–65535). Omit for a source-built
	 * service: the platform injects `PORT` and the app is expected to bind it.
	 *
	 * Set it for a prebuilt `dockerImage` whose listen port is fixed by the
	 * image (Ghost 2368, n8n 5678, WordPress 80). The platform publishes and
	 * health-checks this port and never re-reads what the process actually
	 * bound, so an image listening elsewhere fails its first deploy on a
	 * container that is perfectly healthy.
	 */
	port?: number;
	/**
	 * Create this service from a quickstart template — the template's id, e.g.
	 * `'wordpress'`, `'ghost'`, `'n8n'`, `'uptime-kuma'`, `'vaultwarden'`.
	 * The catalog is the same one the dashboard's New-Service wizard offers.
	 *
	 * An id and nothing else. Everything the template brings — its volumes,
	 * scratch dirs, `runAsUser`, generated secrets, health-check grace period
	 * and companion managed database — is resolved server-side against the
	 * catalog, before the first deploy fires. That is deliberate: a body that
	 * could carry its own volume spec would be a way to request a disk of any
	 * size, and one that could carry its own uid would be choosing the user a
	 * tenant container runs as.
	 *
	 * Which is also why hand-rolling an image template as a plain
	 * `dockerImage` does not work: the same image without the template's
	 * volume, uid and scratch dirs crash-loops under the read-only rootfs.
	 */
	templateId?: string;
	autoDeploy?: boolean;
	multistage?: boolean;
	/** True when this service is a dev environment (agentic dev-env image, or manually flagged). */
	isDevEnvironment?: boolean;
	/**
	 * Run this on one of the team's own enrolled machines instead of HostStack
	 * compute — list them with `client.machines.list(teamId)` and pass the `id`.
	 *
	 * Pinned at creation and never changed afterwards: the container, its image
	 * and anything on its disk live on that machine, so moving it is a data
	 * migration rather than a setting.
	 */
	machineId?: number;
}

/** Companion managed services a standalone dev box can stand up alongside itself. */
export type DevEnvCompanion = 'postgres' | 'redis' | 'meilisearch';

/** Where a standalone dev box's code comes from. */
export type DevEnvSource =
	| { kind: 'github_repo'; githubRepoId: number; branch?: string }
	| { kind: 'url'; cloneUrl: string; branch?: string }
	| { kind: 'blank' };

/**
 * Create a standalone dev environment — a cloud box (Claude Code / Codex /
 * OpenCode on a persistent /workspace) created from a connected GitHub repo, an
 * arbitrary clone URL, or blank, with optional companion Postgres / Redis /
 * Meilisearch wired into its env. Lives in the team's hidden Development home.
 */
export interface CreateDevEnvironmentInput {
	/**
	 * Optional. Omitted (or blank) means the server names the box after its
	 * source — the repo's name, the last segment of a clone URL, or `dev-box` —
	 * and de-duplicates it against the team's existing boxes. A name you DO pass
	 * is used verbatim and never de-duplicated: colliding with one of your own
	 * boxes returns 409 rather than silently becoming something else.
	 */
	name?: string;
	source: DevEnvSource;
	/** Companion databases/search to attach (fresh + empty), like local `make db-up`. */
	databases?: DevEnvCompanion[];
	/**
	 * Compute size for the box. Defaults to `standard` (2 GB) — the server
	 * floors an omitted/sub-standard plan to the OOM-safe `DEV_ENV_MIN_SIZE`,
	 * so a coding agent + build never boots undersized.
	 */
	plan?: string;
	/**
	 * Run this on one of the team's own enrolled machines instead of HostStack
	 * compute — list them with `client.machines.list(teamId)` and pass the `id`.
	 *
	 * Pinned at creation and never changed afterwards: /workspace lives on that
	 * machine's local disk, so moving it is a data migration, not a setting.
	 */
	machineId?: number;
}

/** A dev environment as listed for the Development section — a service plus the
 * companion services attached to it. */
export interface DevEnvironment extends Service {
	devUrl?: string | null;
	/** Companion engines attached to the box (e.g. `['postgres','redis']`). */
	databases?: string[];
	/**
	 * Why the box's container last exited recently, if at all. `'oom_killed'`
	 * means it ran out of memory (the DB status stays `active` because the
	 * health monitor auto-restarts it) — pair with `recommendedSize` to offer
	 * a rescale. `null` when it exited cleanly / hasn't exited.
	 */
	exitReason?: 'oom_killed' | 'crashed' | null;
	/**
	 * Suggested next size tier to rescale to, set when the box recently
	 * OOM-killed. `null` when no rescale is recommended (or already at the
	 * largest tier).
	 */
	recommendedSize?: string | null;
	/**
	 * The container's actual memory ceiling in MB — what
	 * `/sys/fs/cgroup/memory.max` reads inside the box. Do NOT derive this from
	 * `plan`: a dedicated ("Pro") tier resolves below nominal by the agent
	 * reserve, and a per-service memory override REPLACES the tier figure rather
	 * than merely clamping to it. This is the number to size in-box work against.
	 */
	effectiveMemoryMb?: number;
	/**
	 * A per-service override, not the tier, is what caps this box. Distinguishes
	 * "already on the largest tier, nothing to sell you" from "one config value
	 * is holding you below the tier you pay for" — both of which otherwise
	 * present only as `recommendedSize: null`.
	 */
	memoryPinnedBelowTier?: boolean;
}

/**
 * Fields that live on the `services` row — write via PATCH /services/:tid/:sid.
 * Nullable fields accept `null` to clear; `undefined` leaves the value unchanged.
 */
export interface UpdateServiceInput {
	name?: string;
	branch?: string;
	rootDirectory?: string;
	autoDeploy?: boolean;
	installCommand?: string | null;
	buildCommand?: string | null;
	startCommand?: string | null;
	dockerfilePath?: string | null;
	healthCheckPath?: string | null;
	cronSchedule?: string | null;
	publishPath?: string | null;
	runtime?: string;
	/**
	 * Resize the service's size tier (memory/CPU/disk bracket). The supported
	 * way to scale a box past its current tier's resource ceiling — per-config
	 * overrides are clamped to the tier, so growing beyond it needs a tier move.
	 * Dev boxes are floored to the OOM-safe minimum. Applies live to the running
	 * container (memory/CPU) where possible; disk grows on the next recreate.
	 */
	plan?: string;
}

export interface ServiceConfig {
	memoryMb?: number;
	cpuShares?: number;
	diskSizeGb?: number;
	port?: number;
	protocol?: 'http' | 'tcp';
	healthCheckEnabled?: boolean;
	healthCheckInterval?: number;
	healthCheckTimeout?: number;
	healthCheckGracePeriodSec?: number;
	/**
	 * Whether search engines may index the service's free `*.hoststack.dev`
	 * platform hostname. False by default. Custom domains are always indexable
	 * and are not affected by this flag.
	 */
	allowSearchIndexing?: boolean;
	preDeployCommand?: string | null;
	restartPolicy?: 'always' | 'on-failure' | 'no';
	/**
	 * How a deploy replaces the running container. `rolling` (default) is
	 * zero-downtime; `recreate` stops the old container first and is required
	 * for any container holding an exclusive lock on a mounted volume.
	 */
	deployStrategy?: 'rolling' | 'recreate';
	minInstances?: number;
	maxInstances?: number;
	scaleCpuThreshold?: number;
	scaleMemoryThreshold?: number;
	scaleRequestsPerSecThreshold?: number | null;
	dockerImage?: string | null;
	registryUsername?: string | null;
	registryPassword?: string | null;
	/**
	 * v72.2: applied to runtime logs at query time. Reflects what the
	 * service is currently configured to filter; null/absent means no
	 * filtering. See UpdateServiceConfigInput for the write side.
	 */
	logFilterRules?: Array<{ pattern: string; action: 'drop' | 'downgrade' }> | null;
}

/**
 * Fields that live on the `service_config` row — write via PATCH
 * /services/:tid/:sid/config. Build/runtime fields (build/start command,
 * branch, rootDirectory) belong on UpdateServiceInput, not here.
 */
export interface UpdateServiceConfigInput {
	memoryMb?: number;
	cpuShares?: number;
	diskSizeGb?: number;
	port?: number;
	protocol?: 'http' | 'tcp';
	healthCheckEnabled?: boolean;
	healthCheckInterval?: number;
	healthCheckTimeout?: number;
	healthCheckGracePeriodSec?: number;
	/** See ServiceConfig.allowSearchIndexing. Applies on the next deploy. */
	allowSearchIndexing?: boolean;
	preDeployCommand?: string;
	restartPolicy?: 'always' | 'on-failure' | 'no';
	/** See ServiceConfig.deployStrategy. */
	deployStrategy?: 'rolling' | 'recreate';
	minInstances?: number;
	maxInstances?: number;
	scaleCpuThreshold?: number;
	scaleMemoryThreshold?: number;
	scaleRequestsPerSecThreshold?: number | null;
	dockerImage?: string | null;
	registryUsername?: string | null;
	registryPassword?: string | null;
	/**
	 * v72.2: per-service runtime-log filter rules applied at query
	 * time. Each rule matches the message by case-insensitive
	 * substring; matching rows are either dropped or have their
	 * stream flipped from stderr → stdout. Pass an empty array to
	 * clear all rules; null/omitted leaves the existing rules in
	 * place. Capped at 50 rules.
	 */
	logFilterRules?: Array<{ pattern: string; action: 'drop' | 'downgrade' }> | null;
}

// --- Deploys ---
/**
 * `superseded` (v63 P4) means a newer push for the same (service, branch) arrived
 * before this deploy could finish. Distinct from `cancelled` (operator-initiated).
 */
export type DeployStatus =
	| 'pending'
	| 'building'
	| 'build_failed'
	| 'deploying'
	| 'live'
	| 'failed'
	| 'cancelled'
	| 'deactivated'
	| 'superseded';

export type DeployTrigger =
	| 'github_push'
	| 'gitlab_push'
	| 'bitbucket_push'
	| 'manual'
	| 'rollback'
	| 'api'
	| 'config_change';

export interface Deploy {
	id: number;
	publicId: string;
	status: DeployStatus;
	trigger: DeployTrigger;
	commitHash?: string | null;
	commitMessage?: string | null;
	createdAt: string;
	startedAt?: string | null;
	finishedAt?: string | null;
	/**
	 * Wall-clock for the docker build / image-pull step only.
	 * Null when the deploy didn't reach the build phase (cancelled
	 * pre-pickup) or used a pre-built image with no measured pull.
	 *
	 * v89: preserved as a legacy alias of imageBuildMs for back-compat
	 * with pre-v89 SDK consumers. New callers should read imageBuildMs.
	 */
	buildDurationMs?: number | null;
	/**
	 * v89: docker build / image-pull step only. Null on skip-build
	 * redeploys (reusing an already-built image) and on cache-hit deploys
	 * where nothing was actually built. Pair with containerBootMs to
	 * tell "build is slow" apart from "boot is slow".
	 */
	imageBuildMs?: number | null;
	/**
	 * v89: deploying → live wall-clock (container start + health check
	 * + traffic switch). Null on builds that failed before container
	 * start. Combined with imageBuildMs this gives the same total as
	 * the legacy buildDurationMs + the rollout — but split.
	 */
	containerBootMs?: number | null;
	/**
	 * Wall-clock for the full deploy pipeline (build + container
	 * start + health-check + traffic switch + cleanup), computed at
	 * serialize time from finishedAt − startedAt. Absent for deploys
	 * still in-flight or that never reached `startedAt`.
	 */
	totalDurationMs?: number;
}

export interface TriggerDeployInput {
	/** Override the commit to build. Defaults to the tip of the service's tracked branch. */
	commitHash?: string;
	/** Override the branch to build. Defaults to the service's configured branch. */
	branch?: string;
}

// --- Databases ---
/** Managed database engines supported by HostStack. */
export type DatabaseEngine = 'postgres' | 'redis' | 'mysql' | 'mariadb' | 'mongodb';

/**
 * `migrating` (v89 Phase 4) is the transient state while the agent runs the
 * single-node → HA migration (pg_dump → bootstrap → pg_restore). Reads stay
 * read-only during this window.
 */
export type DatabaseStatus =
	'creating' | 'available' | 'suspended' | 'deleting' | 'error' | 'migrating';

export type DatabasePlan = 'free' | 'micro' | 'starter' | 'standard' | 'pro';

export interface Database {
	id: number;
	publicId: string;
	name: string;
	/** The engine name. The legacy `type` alias still ships in API responses
	 * but is deprecated — read `engine` going forward. */
	engine: DatabaseEngine;
	status: DatabaseStatus;
	version?: string | null;
	plan?: DatabasePlan | null;
	region?: RegionId | null;
	projectId: number;
	diskSizeGb?: number;
	memoryMb?: number;
	/** v89: 'standalone' for the default single-node path; 'patroni' for
	 * a row backed by a 3-node Patroni HA cluster. Only meaningful when
	 * `engine === 'postgres'`. */
	pgEngineType?: 'standalone' | 'patroni';
	createdAt: string;
	updatedAt: string;
}

export interface CreateDatabaseInput {
	name: string;
	engine: DatabaseEngine;
	projectId: number;
	/**
	 * v66 P5: bind the new database to a specific environment in the
	 * project. Omit to default to the project's Production env.
	 */
	environmentId?: number;
	version?: string;
	plan?: DatabasePlan;
	region?: RegionId;
	/**
	 * Provision the Postgres container from the PostGIS-enabled image variant so
	 * `CREATE EXTENSION postgis` works. Postgres-only (rejected for other
	 * engines). Defaults to false.
	 */
	postgis?: boolean;
	/**
	 * Provision the Postgres container from the pgvector image variant so
	 * `CREATE EXTENSION vector` works. Postgres-only, and mutually exclusive with
	 * `postgis` (they ship as different base images). Defaults to false.
	 */
	pgvector?: boolean;
	/**
	 * Run this on one of the team's own enrolled machines instead of HostStack
	 * compute — list them with `client.machines.list(teamId)` and pass the `id`.
	 *
	 * Pinned at creation and never changed afterwards: the data directory lives
	 * on that machine's disk. It also comes with a rule — a database there is
	 * reachable only from that SAME machine, and the API refuses to link it to a
	 * service anywhere else rather than letting the first query fail.
	 */
	machineId?: number;
}

export interface UpdateDatabaseInput {
	name?: string;
	plan?: DatabasePlan;
	/** Grow the database disk in GB. Cannot shrink. */
	diskSizeGb?: number;
}

export interface DatabaseCredentials {
	/** Null while the database is still provisioning. */
	host: string | null;
	port: number | null;
	username: string | null;
	password: string;
	databaseName: string;
	connectionUrl: string;
}

// --- Volumes (persistent disks) ---
/**
 * A persistent disk attached to a service. Survives redeploys and
 * container restarts. One service can have multiple volumes; each one is
 * identified by a short `name` and a `mountPath` inside the container.
 */
/**
 * A task in a dev box's backlog: a written prompt plus its run state.
 *
 * `status` spans both worlds on purpose. `idea` and `done` are what a PERSON
 * sets; `queued`/`running`/`needs_input`/`failed`/`cancelled` describe an agent
 * run and belong to the runner. Only the two manual ones are accepted by
 * {@link DevTasksResource.update}.
 */
export interface DevTask {
	id: number;
	publicId: string;
	projectId: number;
	teamId: number;
	/** The dev box it is pinned to, or null while it is a loose backlog idea. */
	serviceId: number | null;
	title: string;
	/** The prompt handed to the agent. Markdown. */
	body: string;
	/** claude | codex | opencode. Null until the task is queued. */
	provider: string | null;
	permissionMode: string;
	status: 'idea' | 'queued' | 'running' | 'needs_input' | 'done' | 'failed' | 'cancelled';
	/** Resume handle for the agent conversation, once a run has produced one. */
	agentSessionId: string | null;
	exitReason: string | null;
	sourceDeployId: number | null;
	sourceIssueId: number | null;
	sortOrder: number;
	createdBy: number | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
}

export interface CreateDevTaskInput {
	projectId: number;
	/** ≤200 chars. */
	title: string;
	/** The prompt. Markdown, ≤20 000 chars. */
	body?: string;
	/** Pin it to a dev box up front; omit for a loose idea. */
	serviceId?: number | null;
}

export interface UpdateDevTaskInput {
	title?: string;
	body?: string;
	serviceId?: number | null;
	provider?: string | null;
	permissionMode?: string;
	/** Only the two a person may set. The runner owns the rest. */
	status?: 'idea' | 'done';
}

export interface Volume {
	id: number;
	publicId: string;
	name: string;
	mountPath: string;
	sizeGb: number;
	status: 'pending' | 'active' | 'deleting';
	serviceId: number;
	createdAt: string;
	updatedAt: string;
}

export interface CreateVolumeInput {
	/** Lowercase alphanumeric and hyphens, ≤64 chars. Used as the docker
	 *  volume identifier — change with care once data is written. */
	name: string;
	/** In-container absolute path where the volume mounts. */
	mountPath: string;
	/** Disk size in GB. 10–10240, default 10 — the floor is Hetzner's minimum
	 *  block-volume size, not ours. Counts against your plan's storage quota
	 *  and is metered for billing. */
	sizeGb?: number;
}

export interface UpdateVolumeInput {
	mountPath?: string;
	/** Off-site backups for this volume. Local docker volumes only — the API
	 *  rejects enabling it on a block-backed volume. */
	backupEnabled?: boolean;
	/** Grow the volume. 10–10240; a block volume can never shrink, and the
	 *  API rejects a smaller value than the current size. */
	sizeGb?: number;
}

// --- Domains ---
export type DomainStatus = 'pending' | 'active' | 'failed' | 'deleting';

export interface Domain {
	id: number;
	publicId: string;
	domain: string;
	status: DomainStatus;
	verified: boolean;
	serviceId?: number | null;
	createdAt: string;
}

export interface AddDomainInput {
	domain: string;
	/** Service to bind the domain to (required). Accepts either a numeric id or a publicId (`svc_…`); the SDK resolves publicIds before sending. */
	serviceId: number | string;
	/** Path-prefix routing — point one hostname at multiple services (e.g. `/api` → api svc, `/` → web svc). */
	pathPrefix?: string | null;
}

export interface UpdateDomainInput {
	/** Promote this hostname to the service's primary domain (sets the canonical URL header). */
	isPrimary?: boolean;
	/** When set, the hostname serves a 301 redirect to this absolute URL instead of routing traffic. */
	redirectTo?: string | null;
}

// --- Environment Variables ---
export interface EnvVar {
	id: number;
	key: string;
	value: string;
	target: EnvVarTarget;
	isSecret: boolean;
}

export type EnvVarTarget = 'build' | 'runtime' | 'both';

export interface CreateEnvVarInput {
	key: string;
	value: string;
	target?: EnvVarTarget;
	isSecret?: boolean;
}

export interface UpdateEnvVarInput {
	value?: string;
	target?: EnvVarTarget;
	isSecret?: boolean;
}

export interface BulkSetEnvVarsInput {
	vars: Array<{ key: string; value: string; target?: EnvVarTarget; isSecret?: boolean }>;
}

// --- Auth ---
export interface User {
	id: number;
	name: string;
	email: string;
	avatarUrl?: string | null;
}

export type TeamRole = 'owner' | 'admin' | 'member';

export interface Team {
	id: number;
	publicId: string;
	name: string;
	slug: string;
	role: TeamRole;
}

export interface MeResponse {
	/** Null when authenticated with an API key (no associated user). */
	user: User | null;
	team?: Team | null;
	apiKey?: { id: number; permission: string };
	/** `'test'` when the API is wired to Stripe's test mode, `'live'` otherwise. */
	stripeMode?: string;
	/** True when the caller is a superadmin acting on behalf of another team. Always false for API-key auth. */
	isImpersonating?: boolean;
	/** v88 P1b: server-side flag the dashboard renders as a "please add a card" prompt for free-tier teams 14+ days in. */
	cardPromptVisible?: boolean;
}

// --- Metrics ---
/**
 * A single point in a service metrics time series. Same shape used for
 * the latest-snapshot and history endpoints.
 */
export interface ServiceMetricsPoint {
	timestamp: string;
	cpuPercent: number;
	memoryUsedMb: number;
	memoryLimitMb: number;
	networkRxBytes: number;
	networkTxBytes: number;
	diskUsedMb: number;
}

/**
 * Latest-snapshot response from `services.getMetrics`. `metrics` is null
 * before the first agent sample lands; `serverOverview` is null when the
 * service is not currently placed on a worker (suspended, between
 * deploys, etc).
 */
export interface ServiceMetricsSnapshot {
	metrics: ServiceMetricsPoint | null;
	serverOverview: {
		cpuPercent: number;
		memoryUsedMb: number;
		memoryLimitMb: number;
		diskUsedMb: number;
		containerCount: number;
	} | null;
}

// --- Cron Executions ---
export type CronExecutionStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type CronExecutionTrigger = 'scheduled' | 'manual';

export interface CronExecution {
	id: number;
	publicId: string;
	status: CronExecutionStatus;
	startedAt?: string | null;
	finishedAt?: string | null;
	exitCode?: number | null;
	triggeredBy?: CronExecutionTrigger | null;
	createdAt: string;
}

// --- Activity Log ---
export interface ActivityLogEntry {
	id: number;
	action: string;
	resourceType: string;
	resourceId: string;
	userId: number;
	userName: string;
	metadata?: Record<string, unknown>;
	createdAt: string;
}

// --- Service Resource Links ---
export type ResourceLinkType = 'database' | 'object_storage' | 'queue' | 'search' | 'email_domain';

export interface ServiceResourceLink {
	id: number;
	serviceId: number;
	teamId: number;
	resourceType: ResourceLinkType;
	resourceId: number;
	/** Uppercase env-var prefix the resource's connection info is injected
	 *  under (e.g. "APP_DB" → APP_DB_HOST, APP_DB_URL, …). */
	alias: string;
	createdAt: string;
}

export interface LinkResourceInput {
	resourceType: ResourceLinkType;
	/** NUMERIC resource id (e.g. `database.id`) — not the publicId. */
	resourceId: number;
	/** Uppercase letters, digits and underscores; must start with a letter. */
	alias: string;
}

/**
 * A row from the unified `managed_resources` Postgres view — every resource
 * class a team owns (database, object storage, queue, search, email domain)
 * in one shape, for discovery and linking.
 */
export interface ManagedResource {
	id: number;
	publicId: string;
	teamId: number;
	/** Resource class, e.g. "database" | "object_storage" | "queue" | "search" | "email_domain". */
	type: string;
	name: string;
	status: string;
	region: string;
	createdAt: string;
}

/**
 * A machine the team owns and enrolled as a runner — a spare desktop, a home
 * server, a VPS you already pay for. Services, dev boxes and databases can be
 * pinned to one at creation instead of running on HostStack compute.
 *
 * Deliberately absent: the pairing token and the agent secret. Both are
 * returned exactly once, by the call that mints them, and are never readable
 * again — so there is no shape here in which a caller could believe a
 * credential is retrievable.
 */
export interface Machine {
	/** The id to pass as `machineId` when creating a service, database or dev box. */
	id: number;
	/** Our namespaced bookkeeping name, e.g. `byo-t3-desktop`. */
	hostname: string;
	/** The name its owner chose, e.g. "desktop". */
	name: string;
	/** `provisioning` until the installer runs, then `active` / `offline` as the
	 *  agent connects and disconnects. */
	status: string;
	/** The installer has run and traded its pairing token for a credential.
	 *  False means the machine was registered but never actually paired. */
	enrolled: boolean;
	totalMemoryMb: number | null;
	totalCpuCores: number | null;
	lastHeartbeatAt: string | null;
	createdAt: string;
	/**
	 * How this machine's agent build compares to the one we ship.
	 *
	 * Not a boolean: `from-source` is a build we deliberately never replace and
	 * cannot identify, so it is neither current nor behind — reporting it as
	 * up to date is how a machine ran for months without a shipped fix.
	 */
	agentBuild: 'current' | 'behind' | 'from-source' | 'unknown';
	/** The build the machine reports running. Null if it is too old to say. */
	agentVersion: string | null;
	/** The build we ship. Null when we ship a floating tag, which is not a
	 *  build identity to compare against. */
	targetAgentVersion: string | null;
	/** The machine has failed its allowance of update attempts, so "it updates
	 *  itself" has stopped being true and someone has to go to it. */
	agentUpdateStuck: boolean;
	/** Why the last update attempt failed, in the machine owner's words — the
	 *  only thing that turns `agentUpdateStuck` into something actionable.
	 *  Null when no attempt has failed. */
	agentUpdateError: string | null;
	/** When that attempt failed. Null when none has. */
	agentUpdateFailedAt: string | null;
	/** Consecutive failed update attempts. Reset to 0 by a successful one. */
	agentUpdateFailures: number;
	/** What is pinned to it right now. Removal is refused while anything is. */
	workloads: { devBoxes: number; services: number; databases: number };
}

/** One thing running on a machine. `kind` matters: switching the machine off
 *  makes a dev box wait, takes a service down, and takes down everything that
 *  reads from a database — including services running elsewhere. */
export interface MachineWorkload {
	kind: 'dev_box' | 'service' | 'database';
	id: number;
	publicId: string;
	name: string;
	status: string;
	projectId: number;
	/** Databases only. */
	engine?: string;
	/** Databases only: a dev box's companion, hidden from the databases list. */
	belongsToDevBox?: boolean;
}
