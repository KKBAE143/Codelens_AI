export interface ApiErrorResponse {
  error: string;
  details?: unknown;
}

function createErrorResponse(
  message: string,
  status: number,
  details?: unknown,
): Response {
  const body: ApiErrorResponse = { error: message };
  if (details !== undefined) {
    body.details = details;
  }
  return Response.json(body, { status });
}

export function apiError(message: string, status = 500): Response {
  return createErrorResponse(message, status);
}

export function apiJsonError(
  message: string,
  status = 500,
  details?: unknown,
): Response {
  return createErrorResponse(message, status, details);
}

export function notFound(message = "Resource not found"): Response {
  return createErrorResponse(message, 404);
}

export function unauthorized(message = "Unauthorized"): Response {
  return createErrorResponse(message, 401);
}

export function forbidden(message = "Forbidden"): Response {
  return createErrorResponse(message, 403);
}

export function badRequest(message: string): Response {
  return createErrorResponse(message, 400);
}

export function serverError(message = "Internal server error"): Response {
  return createErrorResponse(message, 500);
}
