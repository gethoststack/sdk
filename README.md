# @hoststack.dev/sdk

Official TypeScript SDK for [HostStack](https://hoststack.dev) — the European PaaS for deploying web services, databases, cron jobs, and domains on Hetzner infrastructure.

> Think Render.com, but hosted in Europe, built for developers who care about latency and data residency.

[![npm version](https://img.shields.io/npm/v/@hoststack.dev/sdk.svg)](https://www.npmjs.com/package/@hoststack.dev/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@hoststack.dev/sdk.svg)](https://www.npmjs.com/package/@hoststack.dev/sdk)
[![MIT license](https://img.shields.io/npm/l/@hoststack.dev/sdk.svg)](./LICENSE)

- **Website:** [hoststack.dev](https://hoststack.dev)
- **Documentation:** [hoststack.dev/docs](https://hoststack.dev/docs)
- **SDK reference:** [hoststack.dev/docs/sdk](https://hoststack.dev/docs/sdk)
- **Source:** [github.com/miccidk/hoststack](https://github.com/miccidk/hoststack/tree/master/packages/sdk)

## Installation

```bash
npm install @hoststack.dev/sdk
# or
bun add @hoststack.dev/sdk
# or
pnpm add @hoststack.dev/sdk
```

Requires Node.js 18+ (uses native `fetch`). Works in Bun and Deno too.

## Quick start

```ts
import { HostStack } from '@hoststack.dev/sdk';

const client = new HostStack({
	apiKey: 'hs_live_your_api_key',
});

const teamId = 1;

// List your services
const { services } = await client.services.list(teamId);

// Trigger a deploy
const { deploy } = await client.deploys.trigger(teamId, 'svc_abc123');

// Stream runtime logs
const ac = new AbortController();
for await (const entry of client.services.streamLogs(teamId, 'svc_abc123', { signal: ac.signal })) {
	console.log(entry.timestamp, entry.message);
}
```

Generate an API key from your [HostStack dashboard → Settings → API Keys](https://hoststack.dev).

## Resources

| Resource                      | Methods                                                                                                                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client.projects`             | `list`, `get`, `create`, `update`, `delete`                                                                                                                                                                                                                                 |
| `client.services`             | `list`, `get`, `create`, `update`, `delete`, `resize`, `suspend`, `resume`, `getMetrics`, `getMetricsHistory`, `getConfig`, `updateConfig`, `getRuntimeLogs`, `streamLogs`, `listDevEnvironments`, `createDevEnvironment`, `spinUpDevEnvironment`, `tearDownDevEnvironment` |
| `client.deploys`              | `list`, `get`, `trigger`, `cancel`, `rollback`, `promote`, `getLogs`                                                                                                                                                                                                        |
| `client.databases`            | `list`, `get`, `create`, `update`, `delete`, `suspend`, `resume`, `restart`, `getCredentials`, `resetPassword`, `query`, `upgradeToHa`, `upgradeVersion`, `getCluster`, `listRestorePoints`                                                                                 |
| `client.domains`              | `list`, `add`, `update`, `remove`, `verify`                                                                                                                                                                                                                                 |
| `client.envVars`              | `list`, `create`, `update`, `delete`, `bulkSet`, `importFile`                                                                                                                                                                                                               |
| `client.environments`         | `list`, `get`, `create`, `update`, `delete`                                                                                                                                                                                                                                 |
| `client.cron`                 | `list`, `get`, `trigger`                                                                                                                                                                                                                                                    |
| `client.devTasks`             | `list`, `counts`, `get`, `create`, `update`, `delete`                                                                                                                                                                                                                       |
| `client.volumes`              | `list`, `create`, `update`, `delete`, `listRestorePoints`, `restore`                                                                                                                                                                                                        |
| `client.machines`             | `list`, `get`                                                                                                                                                                                                                                                               |
| `client.notifications`        | `listChannels`, `createChannel`, `updateChannel`, `deleteChannel`, `testChannel`                                                                                                                                                                                            |
| `client.errors`               | `listIssues`, `getIssue`, `listOccurrences`, `updateIssue`, `fixInDevBox`, `listIngestKeys`, `createIngestKey`, `deleteIngestKey`                                                                                                                                           |
| `client.analytics`            | `listSites`, `createSite`, `updateSite`, `siteStatus`, `rotateKey`, `getDomainProof`, `verifyDomain`, `deleteSite`, `summary`, `overview`, `realtime`, `eventMetadata`                                                                                                      |
| `client.uptime`               | `get`, `upsert`, `remove`, `getForSite`, `upsertForSite`, `removeForSite`                                                                                                                                                                                                   |
| `client.teams`                | `list`                                                                                                                                                                                                                                                                      |
| `client.dns`                  | `listZones`, `createZone`, `deleteZone`, `checkDelegation`, `listRecords`, `createRecord`, `updateRecord`, `deleteRecord`, `resyncRecord`                                                                                                                                   |
| `client.serviceResourceLinks` | `listManagedResources`, `list`, `create`, `updateAlias`, `delete`                                                                                                                                                                                                           |

Every method's first argument is the team id — accepts either the numeric id or the `team_…` publicId (the SDK resolves publicIds to numeric ids internally and caches the lookup). The one exception is `client.teams.list()`, which takes nothing: it is how you find out which team a key is bound to in the first place. Full API reference: **[hoststack.dev/docs/sdk](https://hoststack.dev/docs/sdk)**.

The build diffs this table against the client, so a resource or method that ships without a row here fails rather than going unmentioned — which is how `client.machines`, `client.dns` and `client.serviceResourceLinks` stayed undocumented for as long as they did.

`client.deploys.promote(teamId, serviceId, deployId, targetEnvironmentId)` performs image-based promotion: it pins the same built image into a sibling environment without rebuilding.

`client.serviceResourceLinks.create(...)` is the step that makes `DATABASE_URL`, `REDIS_URL` and `MONGO_URL` appear in a service's container: link the managed database, then deploy. The credentials are injected server-side, so nothing that runs the SDK ever holds the password.

## Error handling

```ts
import {
	HostStack,
	AuthenticationError,
	ForbiddenError,
	NotFoundError,
	ConflictError,
	RateLimitError,
	HostStackError,
} from '@hoststack.dev/sdk';

try {
	await client.services.get(teamId, 'svc_missing');
} catch (err) {
	if (err instanceof NotFoundError) {
		// 404
	} else if (err instanceof AuthenticationError) {
		// 401 — API key missing or expired
	} else if (err instanceof ForbiddenError) {
		// 403 — key lacks the required scope (e.g. deploy_only trying to mutate)
	} else if (err instanceof ConflictError) {
		// 409 — resource state prevents the op (already exists, in-flight migration, …)
	} else if (err instanceof RateLimitError) {
		// 429 — err.retryAfter is seconds to wait (from Retry-After header), or undefined
	} else if (err instanceof HostStackError) {
		// any other API error — err.statusCode and err.body are available
	}
}
```

## Related packages

- **[@hoststack.dev/cli](https://www.npmjs.com/package/@hoststack.dev/cli)** — command-line interface for HostStack
- **[@hoststack.dev/mcp](https://www.npmjs.com/package/@hoststack.dev/mcp)** — MCP server for Claude, Cursor, and other AI agents
- **Terraform provider** — see [hoststack.dev/docs](https://hoststack.dev/docs) for installation and resource reference

## Support

- Issues: [github.com/miccidk/hoststack/issues](https://github.com/miccidk/hoststack/issues)
- Docs: [hoststack.dev/docs](https://hoststack.dev/docs)
- Homepage: [hoststack.dev](https://hoststack.dev)

## License

MIT © [HostStack Contributors](https://hoststack.dev)
