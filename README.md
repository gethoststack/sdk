# @hoststack.dev/sdk

Official TypeScript SDK for [HostStack](https://hoststack.dev) — the European PaaS for deploying web services, databases, cron jobs, and domains on Hetzner infrastructure.

> Think Render.com, but hosted in Europe, built for developers who care about latency and data residency.

[![npm version](https://img.shields.io/npm/v/@hoststack.dev/sdk.svg)](https://www.npmjs.com/package/@hoststack.dev/sdk)
[![npm downloads](https://img.shields.io/npm/dm/@hoststack.dev/sdk.svg)](https://www.npmjs.com/package/@hoststack.dev/sdk)
[![MIT license](https://img.shields.io/npm/l/@hoststack.dev/sdk.svg)](./LICENSE)

- **Website:** [hoststack.dev](https://hoststack.dev)
- **Documentation:** [hoststack.dev/docs](https://hoststack.dev/docs)
- **SDK reference:** [hoststack.dev/docs/sdk](https://hoststack.dev/docs/sdk)
- **Source:** [github.com/gethoststack/sdk](https://github.com/gethoststack/sdk)

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

| Resource | Methods |
| --- | --- |
| `client.projects` | `list`, `get`, `create`, `update`, `delete` |
| `client.services` | `list`, `get`, `create`, `update`, `delete`, `suspend`, `resume`, `getMetrics`, `getConfig`, `updateConfig`, `getRuntimeLogs`, `streamLogs` |
| `client.deploys` | `list`, `get`, `trigger`, `cancel`, `rollback`, `getLogs` |
| `client.databases` | `list`, `get`, `create`, `update`, `delete`, `suspend`, `resume`, `getCredentials`, `resetPassword` |
| `client.domains` | `list`, `add`, `update`, `remove`, `verify` |
| `client.envVars` | `list`, `create`, `update`, `delete`, `bulkSet` |
| `client.cron` | `list`, `get`, `trigger` |

Every method's first argument is `teamId: number`. Full API reference: **[hoststack.dev/docs/sdk](https://hoststack.dev/docs/sdk)**.

## Error handling

```ts
import {
	HostStack,
	AuthenticationError,
	NotFoundError,
	RateLimitError,
	HostStackError,
} from '@hoststack.dev/sdk';

try {
	await client.services.get(teamId, 'svc_missing');
} catch (err) {
	if (err instanceof NotFoundError) {
		// 404
	} else if (err instanceof AuthenticationError) {
		// 401/403
	} else if (err instanceof RateLimitError) {
		// 429 — err.retryAfter is seconds to wait
	} else if (err instanceof HostStackError) {
		// any other API error — err.status, err.body
	}
}
```

## Related packages

- **[@hoststack.dev/cli](https://www.npmjs.com/package/@hoststack.dev/cli)** — command-line interface for HostStack
- **[Terraform provider](https://github.com/gethoststack/terraform-provider-hoststack)** — manage HostStack resources as IaC

## Support

- Issues: [github.com/gethoststack/sdk/issues](https://github.com/gethoststack/sdk/issues)
- Docs: [hoststack.dev/docs](https://hoststack.dev/docs)
- Homepage: [hoststack.dev](https://hoststack.dev)

## License

MIT © [HostStack Contributors](https://hoststack.dev)
