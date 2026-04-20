import { describe, expect, test } from 'bun:test';

import { buildPaginationQuery, wrapArray } from '../pagination.ts';

describe('buildPaginationQuery', () => {
	test('returns empty string when params omitted', () => {
		expect(buildPaginationQuery()).toBe('');
	});

	test('returns empty string when params is empty object', () => {
		expect(buildPaginationQuery({})).toBe('');
	});

	test('encodes limit only', () => {
		expect(buildPaginationQuery({ limit: 20 })).toBe('?limit=20');
	});

	test('encodes offset only', () => {
		expect(buildPaginationQuery({ offset: 40 })).toBe('?offset=40');
	});

	test('encodes both limit and offset', () => {
		expect(buildPaginationQuery({ limit: 20, offset: 40 })).toBe('?limit=20&offset=40');
	});

	test('treats limit=0 as present', () => {
		expect(buildPaginationQuery({ limit: 0 })).toBe('?limit=0');
	});
});

describe('wrapArray', () => {
	test('wraps an array with full metadata', () => {
		const result = wrapArray([1, 2, 3]);
		expect(result.items).toEqual([1, 2, 3]);
		expect(result.total).toBe(3);
		expect(result.limit).toBe(3);
		expect(result.offset).toBe(0);
		expect(result.hasMore).toBe(false);
	});

	test('respects explicit limit/offset', () => {
		const result = wrapArray(['a', 'b'], { limit: 10, offset: 5 });
		expect(result.limit).toBe(10);
		expect(result.offset).toBe(5);
		expect(result.items).toEqual(['a', 'b']);
	});

	test('empty array is fine', () => {
		const result = wrapArray<string>([]);
		expect(result.items).toHaveLength(0);
		expect(result.total).toBe(0);
		expect(result.hasMore).toBe(false);
	});
});
