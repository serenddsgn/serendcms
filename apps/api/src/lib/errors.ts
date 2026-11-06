import type { ErrorCode } from '@serend/schema';

/** Erwarteter Fehler mit Status und Code; die Meldung darf an Clients gehen. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  unauthenticated: () => new AppError(401, 'unauthenticated', 'Anmeldung erforderlich.'),
  invalidCredentials: () =>
    new AppError(401, 'invalid_credentials', 'E-Mail oder Passwort ist falsch.'),
  forbidden: (msg = 'Keine Berechtigung.') => new AppError(403, 'forbidden', msg),
  csrf: () => new AppError(403, 'csrf_invalid', 'Ungültiges CSRF-Token.'),
  origin: () => new AppError(403, 'origin_invalid', 'Ungültiger Origin.'),
  notFound: (msg = 'Nicht gefunden.') => new AppError(404, 'not_found', msg),
  conflict: (msg: string) => new AppError(409, 'conflict', msg),
  rateLimited: () =>
    new AppError(429, 'rate_limited', 'Zu viele Anfragen. Bitte später erneut versuchen.'),
};
