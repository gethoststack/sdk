export class HostStackError extends Error {
	public readonly statusCode: number;

	constructor(statusCode: number, message: string) {
		super(message);
		this.name = 'HostStackError';
		this.statusCode = statusCode;
	}
}

export class AuthenticationError extends HostStackError {
	constructor(message = 'Authentication failed. Check your API key.') {
		super(401, message);
		this.name = 'AuthenticationError';
	}
}

export class NotFoundError extends HostStackError {
	constructor(message = 'Resource not found.') {
		super(404, message);
		this.name = 'NotFoundError';
	}
}

export class RateLimitError extends HostStackError {
	constructor(message = 'Rate limit exceeded. Try again later.') {
		super(429, message);
		this.name = 'RateLimitError';
	}
}
