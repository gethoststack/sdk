import { describe, expect, test } from 'bun:test';

import { AuthenticationError, HostStackError, NotFoundError, RateLimitError } from '../errors.ts';

describe('SDK errors', () => {
	test('HostStackError carries the status code + message', () => {
		const err = new HostStackError(500, 'Internal');
		expect(err).toBeInstanceOf(Error);
		expect(err.statusCode).toBe(500);
		expect(err.message).toBe('Internal');
		expect(err.name).toBe('HostStackError');
	});

	test('AuthenticationError is a HostStackError with 401', () => {
		const err = new AuthenticationError('nope');
		expect(err).toBeInstanceOf(HostStackError);
		expect(err.statusCode).toBe(401);
		expect(err.name).toBe('AuthenticationError');
		expect(err.message).toBe('nope');
	});

	test('AuthenticationError has a sensible default message', () => {
		expect(new AuthenticationError().message).toMatch(/authentication/i);
	});

	test('NotFoundError is a HostStackError with 404', () => {
		const err = new NotFoundError('gone');
		expect(err.statusCode).toBe(404);
		expect(err.name).toBe('NotFoundError');
	});

	test('RateLimitError is a HostStackError with 429', () => {
		const err = new RateLimitError();
		expect(err.statusCode).toBe(429);
		expect(err.name).toBe('RateLimitError');
		expect(err.message).toMatch(/rate limit/i);
	});
});
