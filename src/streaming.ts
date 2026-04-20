export interface LogEntry {
	timestamp: string;
	level?: string | null;
	stream?: string | null;
	message: string;
}

export interface StreamLogsOptions {
	/** Filter by stream: 'stdout' or 'stderr'. */
	stream?: 'stdout' | 'stderr';
	/** Number of historical lines to fetch on first poll (default: 100). */
	initialLines?: number;
	/** Poll interval in milliseconds (default: 2000). */
	pollInterval?: number;
	/** AbortSignal to stop streaming. */
	signal?: AbortSignal;
}

/**
 * Streams runtime logs for a service by polling the logs REST endpoint.
 * Yields log entries as they appear. Use an AbortController to stop.
 *
 * @example
 * ```ts
 * const ac = new AbortController();
 * for await (const entry of client.services.streamLogs(teamId, serviceId, { signal: ac.signal })) {
 *   console.log(entry.message);
 * }
 * ```
 */
export async function* streamLogsViaPolling(
	fetch: (path: string) => Promise<{ logs: LogEntry[] | string }>,
	basePath: string,
	options: StreamLogsOptions = {},
): AsyncGenerator<LogEntry> {
	const pollInterval = options.pollInterval ?? 2000;
	const initialLines = options.initialLines ?? 100;

	// Track seen timestamps to avoid duplicates on first yield
	let lastTimestamp: string | null = null;

	const buildPath = (lines?: number, since?: string) => {
		const params = new URLSearchParams();
		if (options.stream) params.set('stream', options.stream);
		if (lines !== undefined) params.set('lines', String(lines));
		if (since) params.set('since', since);
		const qs = params.toString();
		return `${basePath}${qs ? `?${qs}` : ''}`;
	};

	// Initial fetch
	const initialData = await fetch(buildPath(initialLines));
	const initial = normalizeEntries(initialData.logs);
	for (const entry of initial) {
		yield entry;
		if (entry.timestamp > (lastTimestamp ?? '')) {
			lastTimestamp = entry.timestamp;
		}
	}

	// Poll loop
	while (!options.signal?.aborted) {
		await sleep(pollInterval, options.signal);
		if (options.signal?.aborted) break;

		const sinceTs = lastTimestamp ? new Date(lastTimestamp).toISOString() : undefined;
		const data = await fetch(buildPath(undefined, sinceTs)).catch(() => ({ logs: [] }));
		const entries = normalizeEntries(data.logs);

		for (const entry of entries) {
			if (!lastTimestamp || entry.timestamp > lastTimestamp) {
				yield entry;
				lastTimestamp = entry.timestamp;
			}
		}
	}
}

function normalizeEntries(logs: LogEntry[] | string): LogEntry[] {
	if (typeof logs === 'string') {
		const lines = logs.split('\n').filter(Boolean);
		return lines.map((line) => ({
			timestamp: new Date().toISOString(),
			message: line,
		}));
	}
	return logs;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		if (signal) {
			signal.addEventListener('abort', () => {
				clearTimeout(timer);
				reject(new DOMException('Aborted', 'AbortError'));
			});
		}
	});
}
