export interface ApiResponse<T> {
  success: boolean;
  message: string | null;
  data: T | null;
  errorCode: string | null;
}

/**
 * The PAGED envelope - the backend's `ApiResponsePage`, used by
 * `GET /api/roles/permissions` and nothing else today.
 *
 * It is not `ApiResponse` with extra fields: there is no `message` and no
 * `errorCode` on it at all. A refusal still arrives as the plain envelope
 * above, which is why error handling needs no branch for this shape.
 */
export interface ApiPageResponse<T> {
  success: boolean;
  data: T[] | null;
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}
