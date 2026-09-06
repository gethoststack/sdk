export class HostStackError extends Error {
	public readonly statusCode: number;
	/** Raw response body, if it parsed as JSON. Useful for surfacing field-level validation errors. */
	public readonly body: unknown;

	constructor(statusCode: number, message: string, body?: unknown) {
		super(message);
		this.name = 'HostStackError';
		this.statusCode = statusCode;
		this.body = body;
	}
}

export class AuthenticationError extends HostStackError {
	constructor(message = 'Authentication failed — check your API key.', body?: unknown) {
		super(401, message, body);
		this.name = 'AuthenticationError';
	}
}

export class ForbiddenError extends HostStackError {
	constructor(message = 'Permission denied — API key lacks the required scope.', body?: unknown) {
		super(403, message, body);
		this.name = 'ForbiddenError';
	}
}

export class NotFoundError extends HostStackError {
	constructor(message = 'Resource not found.', body?: unknown) {
		super(404, message, body);
		this.name = 'NotFoundError';
	}
}

export class ConflictError extends HostStackError {
	constructor(
		message = 'Conflict — the resource state prevents this operation.',
		body?: unknown,
	) {
		super(409, message, body);
		this.name = 'ConflictError';
	}
}

export class RateLimitError extends HostStackError {
	/**
	 * Seconds to wait before retrying, parsed from the `Retry-After` response
	 * header. `undefined` if the server didn't send one.
	 */
	public readonly retryAfter: number | undefined;

	constructor(
		message = 'Rate limit exceeded — back off and retry.',
		retryAfter?: number,
		body?: unknown,
	) {
		super(429, message, body);
		this.name = 'RateLimitError';
		this.retryAfter = retryAfter;
	}
}
