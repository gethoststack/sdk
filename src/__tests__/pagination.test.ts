import { describe, expect, test } from 'bun:test';

import { buildPaginationQuery } from '../pagination.ts';

describe('buildPaginationQuery', () => {
	test('returns empty string when params omitted', () => {
		expect(buildPaginationQuery()).toBe('');
	});

	test('returns empty string when params is empty object', () => {
		expect(buildPaginationQuery({})).toBe('');
	});

	test('encodes page only', () => {
		expect(buildPaginationQuery({ page: 2 })).toBe('?page=2');
	});

	test('encodes perPage only', () => {
		expect(buildPaginationQuery({ perPage: 50 })).toBe('?perPage=50');
	});

	test('encodes both page and perPage', () => {
		expect(buildPaginationQuery({ page: 3, perPage: 25 })).toBe('?page=3&perPage=25');
	});

	test('treats page=0 as present', () => {
		expect(buildPaginationQuery({ page: 0 })).toBe('?page=0');
	});

	test('serializes search + sort params alongside page/perPage', () => {
		const qs = buildPaginationQuery({
			page: 1,
			perPage: 20,
			search: 'foo',
			sortBy: 'createdAt',
			sortOrder: 'asc',
		});
		expect(qs).toContain('page=1');
		expect(qs).toContain('perPage=20');
		expect(qs).toContain('search=foo');
		expect(qs).toContain('sortBy=createdAt');
		expect(qs).toContain('sortOrder=asc');
	});
});
