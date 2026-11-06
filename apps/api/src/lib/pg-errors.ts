function hasCode(err: unknown, code: string): boolean {
  // Drizzle verpackt den pg-Fehler in `cause`, daher die Kette prüfen.
  for (let e: unknown = err, depth = 0; e && typeof e === 'object' && depth < 5; depth++) {
    if ((e as { code?: string }).code === code) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
export const isUniqueViolation = (err: unknown) => hasCode(err, '23505');
/** 23503 = foreign_key_violation, 23001 = restrict_violation (ON DELETE RESTRICT). */
export const isForeignKeyViolation = (err: unknown) =>
  hasCode(err, '23503') || hasCode(err, '23001');
