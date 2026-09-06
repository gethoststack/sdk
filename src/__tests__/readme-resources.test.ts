/**
 * The published README's resource table, checked against the client it
 * describes.
 *
 * README.md is in `files`, so this table is the page npm renders — for most
 * callers it is the API reference, read long before hoststack.dev/docs/sdk. It
 * had fallen four resources behind (`machines`, `dns`, `serviceResourceLinks`,
 * `teams` were all wired onto the client and none appeared) and several methods
 * behind on the rows it did carry, which reads as "the SDK cannot do this"
 * rather than "the table is old".
 *
 * A README cannot compute anything, so the only thing that keeps it honest is a
 * diff against the real object. Instantiating the client is enough — the
 * resources are constructed eagerly and their methods live on the prototypes —
 * and no request is made, so the fake key never leaves the process.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'bun:test';

import { HostStack } from '../client.ts';

const README = path.resolve(import.meta.dir, '..', '..', 'README.md');

/** Rows of the resource table: `| \`client.x\` | \`a\`, \`b\` |`. */
const ROW = /^\|\s*`client\.([A-Za-z]+)`\s*\|(.*)\|\s*$/;

function documentedResources(): Map<string, string[]> {
	const documented = new Map<string, string[]>();
	for (const line of fs.readFileSync(README, 'utf8').split('\n')) {
		const row = ROW.exec(line);
		if (!row) continue;
		const methods = [...(row[2] ?? '').matchAll(/`([A-Za-z]+)`/g)].map((m) => m[1]!);
		documented.set(row[1]!, methods.sort());
	}
	return documented;
}

function actualResources(): Map<string, string[]> {
	const client = new HostStack({ apiKey: 'hs_test_readme' }) as unknown as Record<
		string,
		unknown
	>;
	const actual = new Map<string, string[]>();
	for (const [property, value] of Object.entries(client)) {
		if (value === null || typeof value !== 'object') continue;
		if (!value.constructor.name.endsWith('Resource')) continue;
		const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(value))
			.filter((name) => name !== 'constructor')
			.sort();
		actual.set(property, methods);
	}
	return actual;
}

describe('README resource table matches the client', () => {
	const documented = documentedResources();
	const actual = actualResources();

	it('finds resources on both sides (the table parse itself works)', () => {
		// Guards the guard: a reformat that breaks the row regex would leave
		// this file passing against an empty table forever.
		expect(documented.size).toBeGreaterThan(10);
		expect(actual.size).toBeGreaterThan(10);
	});

	it('documents every resource on the client, and invents none', () => {
		const missing = [...actual.keys()].filter((r) => !documented.has(r)).sort();
		const invented = [...documented.keys()].filter((r) => !actual.has(r)).sort();
		expect({ missing, invented }).toEqual({ missing: [], invented: [] });
	});

	it('lists every method of each resource, and invents none', () => {
		// Whole-list equality rather than a subset check: a method named here
		// that does not exist is the more expensive failure of the two, because
		// the caller writes the call before finding out.
		const wrong = [...actual.entries()]
			.filter(([resource, methods]) => {
				const listed = documented.get(resource);
				return !listed || listed.join(',') !== methods.join(',');
			})
			.map(
				([resource, methods]) =>
					`client.${resource}: client=[${methods.join(', ')}] readme=[${(documented.get(resource) ?? []).join(', ')}]`,
			)
			.sort();
		expect(wrong).toEqual([]);
	});
});
