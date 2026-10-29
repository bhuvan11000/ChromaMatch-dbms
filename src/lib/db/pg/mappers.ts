/**
 * PostgreSQL type mappers — Architecture §5.8.1.
 *
 * postgres.js/Drizzle return NUMERIC columns as strings. Convert them at the
 * data-access boundary so services deal in plain numbers.
 */

export function numericToNumber(value: string): number {
  return Number(value);
}

export function nullableNumericToNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}
