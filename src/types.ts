// --- Projects ---
export interface Project {
	id: number;
	publicId: string;
	name: string;
	slug: string;
	description?: string | null;
	region: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateProjectInput {
	name: string;
	description?: string;
	region?: string;
}

export interface UpdateProjectInput {
	name?: string;
	description?: string;
}

// --- Services ---
export interface Service {
	id: number;
	publicId: string;
	name: string;
	type: string;
	status: string;
	internalUrl?: string | null;
	projectId: number;
	createdAt: string;
	updatedAt: string;
}

export interface CreateServiceInput {
	name: string;
	type: string;
	projectId?: string;
	gitUrl?: string;
	branch?: string;
	buildCommand?: string;
	startCommand?: string;
}

export interface UpdateServiceInput {
	name?: string;
}

export interface ServiceConfig {
	buildCommand?: string | null;
	startCommand?: string | null;
	branch?: string | null;
	rootDirectory?: string | null;
	dockerfilePath?: string | null;
	autoDeploy?: boolean;
	instanceCount?: number;
	plan?: string;
}

export interface UpdateServiceConfigInput {
	buildCommand?: string;
	startCommand?: string;
	branch?: string;
	rootDirectory?: string;
	dockerfilePath?: string;
	autoDeploy?: boolean;
	instanceCount?: number;
	plan?: string;
}

// --- Deploys ---
export interface Deploy {
	id: number;
	publicId: string;
	status: string;
	trigger: string;
	commitHash?: string | null;
	commitMessage?: string | null;
	createdAt: string;
	startedAt?: string | null;
	finishedAt?: string | null;
}

export interface TriggerDeployInput {
	clearCache?: boolean;
}

// --- Databases ---
export interface Database {
	id: number;
	publicId: string;
	name: string;
	type: string;
	status: string;
	version?: string | null;
	projectId: number;
	createdAt: string;
	updatedAt: string;
}

export interface CreateDatabaseInput {
	name: string;
	type: string;
	projectId: number;
	version?: string;
}

export interface UpdateDatabaseInput {
	name?: string;
}

export interface DatabaseCredentials {
	host: string;
	port: number;
	username: string;
	password: string;
	database: string;
	connectionUrl: string;
}

// --- Domains ---
export interface Domain {
	id: number;
	publicId?: string;
	domain: string;
	status: string;
	verified: boolean;
	serviceId?: number | null;
	createdAt: string;
}

export interface AddDomainInput {
	domain: string;
	serviceId?: string;
}

export interface UpdateDomainInput {
	serviceId?: string;
}

// --- Environment Variables ---
export interface EnvVar {
	id: number;
	publicId?: string;
	key: string;
	value: string;
	isSecret: boolean;
}

export interface CreateEnvVarInput {
	key: string;
	value: string;
	isSecret?: boolean;
}

export interface UpdateEnvVarInput {
	key?: string;
	value?: string;
	isSecret?: boolean;
}

export interface BulkSetEnvVarsInput {
	envVars: Array<{ key: string; value: string; isSecret?: boolean }>;
}

// --- Auth ---
export interface User {
	id: number;
	name: string;
	email: string;
	avatarUrl?: string | null;
}

export interface Team {
	id: number;
	name: string;
	slug: string;
	role: string;
}

export interface MeResponse {
	user: User;
	team?: Team;
}

// --- Metrics ---
export interface ServiceMetrics {
	cpu: number;
	memory: number;
	network: number;
	requests: number;
}

// --- Cron Executions ---
export interface CronExecution {
	id: number;
	publicId: string;
	status: string;
	startedAt?: string | null;
	finishedAt?: string | null;
	exitCode?: number | null;
	triggeredBy?: string | null;
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
