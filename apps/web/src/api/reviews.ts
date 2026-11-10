import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { http } from './http';
import { ApiError } from './identity';
import { isPropertyId } from './properties';
import type { ReviewPage } from '../types/catalog';

/**
 * Property reviews through the Gateway (`GET /properties/:id/reviews`). Provisional shape: the
 * reviews-service OpenAPI is not published yet (see `types/catalog.ts`).
 */

export const reviewKeys = {
  all: ['reviews'] as const,
  property: (propertyId: string, page: number, pageSize: number) => [...reviewKeys.all, 'property', propertyId, page, pageSize] as const,
};

export async function getPropertyReviews(
  propertyId: string, { page = 1, pageSize = 5 }: { page?: number; pageSize?: number } = {}, signal?: AbortSignal,
): Promise<ReviewPage> {
  if (!isPropertyId(propertyId)) throw new ApiError(404, { code: 'NOT_FOUND' });
  const { data } = await http.get<ReviewPage>(`/properties/${propertyId}/reviews`, { params: { page, pageSize }, signal });
  return data;
}

export function usePropertyReviews(propertyId: string | undefined, page = 1, pageSize = 5) {
  return useQuery({
    queryKey: reviewKeys.property(propertyId ?? '', page, pageSize),
    queryFn: ({ signal }) => getPropertyReviews(propertyId ?? '', { page, pageSize }, signal),
    enabled: isPropertyId(propertyId),
    placeholderData: keepPreviousData,
  });
}
