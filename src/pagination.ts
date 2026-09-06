/**
 * Standard pagination parameters for list requests.
 *
 * Mirrors `packages/shared/src/schemas/pagination.ts` — the API uses
 * `page` (1-based) + `perPage` (≤100) everywhere. Use these names
 * directly in your code; the SDK serializes them as the matching
 * query-string params.
 */
export interface PaginationParams {
	/** 1-based page number. Default `1`. */
	page?: number;
	/** Items per page. Range 1–100, default `20`. */
	perPage?: number;
	/** Free-text search applied server-side. ≤200 chars. */
	search?: string;
	/** Column to sort by (route-dependent). */
	sortBy?: string;
	/** Sort direction. Default `'desc'`. */
	sortOrder?: 'asc' | 'desc';
}

/**
 * A paginated response wrapper. Mirrors the shape every paginated API
 * endpoint returns under `data` + `total` + `page` + `perPage` + `totalPages`.
 */
export interface PaginatedResponse<T> {
	data: T[];
	total: number;
	page: number;
	perPage: number;
	totalPages: number;
}

/**
 * Builds a query string from pagination params.
 * Returns an empty string if no params are set.
 */
export function buildPaginationQuery(params?: PaginationParams): string {
	if (!params) return '';
	const qs = new URLSearchParams();
	if (params.page !== undefined) qs.set('page', String(params.page));
	if (params.perPage !== undefined) qs.set('perPage', String(params.perPage));
	if (params.search !== undefined) qs.set('search', params.search);
	if (params.sortBy !== undefined) qs.set('sortBy', params.sortBy);
	if (params.sortOrder !== undefined) qs.set('sortOrder', params.sortOrder);
	const str = qs.toString();
	return str ? `?${str}` : '';
}
