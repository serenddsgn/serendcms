import { ErrorResponse } from '@serend/schema';

/** Fehlerantworten für die OpenAPI-Doku. */
export const errorResponses = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  409: ErrorResponse,
  429: ErrorResponse,
};
