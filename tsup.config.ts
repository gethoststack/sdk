import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// Inject the real package version at build time so the User-Agent
// (`hoststack-sdk/<version>`) always matches what's published, instead of a
// hand-edited constant that drifts.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
	version: string;
};

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	dts: true,
	clean: true,
	sourcemap: true,
	target: 'node18',
	splitting: false,
	treeshake: true,
	define: {
		__SDK_VERSION__: JSON.stringify(pkg.version),
	},
	// `@hoststack/shared` is `private: true` and unpublishable. The SDK only
	// touches it as a *type-only* import in `src/shared-guard.ts` (a build-time
	// drift check that is never exported from the entry), so nothing from shared
	// reaches the bundled JS or the published `.d.ts`. No `noExternal` needed.
});
