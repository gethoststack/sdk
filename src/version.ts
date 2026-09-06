/**
 * Package version, injected at build time by tsup's `define`
 * (`__SDK_VERSION__` ← package.json `version`). The `declare` keeps the
 * source typecheckable without a build; the `?? '0.0.0-dev'` fallback keeps
 * the un-bundled source (tests, ts-node) working when the define is absent.
 */
declare const __SDK_VERSION__: string | undefined;

const SDK_VERSION: string = typeof __SDK_VERSION__ === 'string' ? __SDK_VERSION__ : '0.0.0-dev';

/** User-Agent sent on every SDK request, e.g. `hoststack-sdk/0.11.1`. */
export const USER_AGENT = `hoststack-sdk/${SDK_VERSION}`;
