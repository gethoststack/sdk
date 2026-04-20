/**
 * Standard pagination parameters for list requests.
 */
export interface PaginationParams {
	/** Maximum number of items to return. */
	limit?: number;
	/** Number of items to skip. */
	offset?: number;
}

/**
 * A paginated response wrapper.
 */
export interface PaginatedResponse<T> {
	items: T[];
	total: number;
	limit: number;
	offset: number;
	hasMore: boolean;
}

/**
 * Builds a query string from pagination params.
 * Returns an empty string if no params are set.
 */
export function buildPaginationQuery(params?: PaginationParams): string {
	if (!params) return '';
	const qs = new URLSearchParams();
	if (params.limit !== undefined) qs.set('limit', String(params.limit));
	if (params.offset !== undefined) qs.set('offset', String(params.offset));
	const str = qs.toString();
	return str ? `?${str}` : '';
}

/**
 * Wraps a plain array result into a PaginatedResponse.
 * Useful when the API returns a flat array without pagination metadata.
 */
export function wrapArray<T>(
	items: T[],
	params?: PaginationParams,
): PaginatedResponse<T> {
	const limit = params?.limit ?? items.length;
	const offset = params?.offset ?? 0;
	return {
		items,
		total: items.length,
		limit,
		offset,
		hasMore: false,
	};
}
