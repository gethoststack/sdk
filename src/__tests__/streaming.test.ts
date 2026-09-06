import { describe, expect, test } from 'bun:test';

import { type LogEntry, streamLogsViaPolling } from '../streaming.ts';

function collect<T>(gen: AsyncGenerator<T>, limit: number): Promise<T[]> {
	return (async () => {
		const out: T[] = [];
		for await (const item of gen) {
			out.push(item);
			if (out.length >= limit) break;
		}
		return out;
	})();
}

describe('streamLogsViaPolling', () => {
	test('yields every entry from the initial fetch, then stops when aborted', async () => {
		const initial: LogEntry[] = [
			{ timestamp: '2026-01-01T00:00:00Z', message: 'one' },
			{ timestamp: '2026-01-01T00:00:01Z', message: 'two' },
			{ timestamp: '2026-01-01T00:00:02Z', message: 'three' },
		];

		const ac = new AbortController();
		const fetchFn = async () => {
			// After the initial fetch, abort so the generator returns.
			queueMicrotask(() => ac.abort());
			return { logs: initial };
		};

		const entries = await collect(
			streamLogsViaPolling(fetchFn, '/logs', {
				pollInterval: 10,
				signal: ac.signal,
			}),
			3,
		);

		expect(entries.map((e) => e.message)).toEqual(['one', 'two', 'three']);
	});

	test('dedupes entries whose timestamp is already seen', async () => {
		const ac = new AbortController();
		let call = 0;
		const fetchFn = async (path: string) => {
			call++;
			// Simulate: first call returns two entries; second call overlaps.
			if (call === 1) {
				return {
					logs: [
						{ timestamp: '2026-01-01T00:00:00Z', message: 'A' },
						{ timestamp: '2026-01-01T00:00:01Z', message: 'B' },
					],
				};
			}
			// Second call returns one duplicate ('B') and one new ('C').
			if (path.includes('since=')) {
				queueMicrotask(() => ac.abort());
				return {
					logs: [
						{ timestamp: '2026-01-01T00:00:01Z', message: 'B-dup' },
						{ timestamp: '2026-01-01T00:00:02Z', message: 'C' },
					],
				};
			}
			return { logs: [] };
		};

		const entries = await collect(
			streamLogsViaPolling(fetchFn, '/logs', {
				pollInterval: 10,
				signal: ac.signal,
			}),
			3,
		);

		expect(entries.map((e) => e.message)).toEqual(['A', 'B', 'C']);
	});

	test('normalizes string-shaped log payloads into LogEntry[]', async () => {
		const ac = new AbortController();
		const fetchFn = async () => {
			queueMicrotask(() => ac.abort());
			return { logs: 'line-1\nline-2\n' };
		};

		const entries = await collect(
			streamLogsViaPolling(fetchFn, '/logs', {
				pollInterval: 10,
				signal: ac.signal,
			}),
			2,
		);

		expect(entries.map((e) => e.message)).toEqual(['line-1', 'line-2']);
	});

	test('first fetch uses initialLines query when specified', async () => {
		const ac = new AbortController();
		const paths: string[] = [];
		const fetchFn = async (path: string) => {
			paths.push(path);
			queueMicrotask(() => ac.abort());
			return { logs: [] };
		};

		// Just iterate; empty initial logs means no yields, then abort.
		const iter = streamLogsViaPolling(fetchFn, '/logs', {
			initialLines: 42,
			pollInterval: 10,
			signal: ac.signal,
		});
		// Consume (will finish immediately after first fetch due to abort).
		for await (const _ of iter) {
			void _;
		}

		expect(paths[0]).toBe('/logs?limit=42');
	});
});
