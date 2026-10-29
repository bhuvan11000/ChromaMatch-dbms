/**
 * UTC date/time helpers — Architecture §5.4.5.
 *
 * Every function takes the relevant instant or date as an argument. Nothing in
 * this module calls `Date.now()`; the outermost service/handler decides "now".
 */

const UTC_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Format an instant as its UTC calendar date (`YYYY-MM-DD`). */
export function utcDateString(date: Date): string {
  assertValidDate(date);

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The next 00:00 UTC strictly after `date`. */
export function nextUtcMidnight(date: Date): Date {
  assertValidDate(date);

  const next = new Date(date.getTime());
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

/** Add `n` calendar days to a UTC date string. */
export function addDays(dateString: string, n: number): string {
  if (!Number.isInteger(n)) {
    throw new RangeError("The number of days must be an integer.");
  }

  const date = parseUtcDate(dateString);
  date.setUTCDate(date.getUTCDate() + n);
  return utcDateString(date);
}

function assertValidDate(date: Date): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("A valid Date is required.");
  }
}

function parseUtcDate(dateString: string): Date {
  const match = UTC_DATE_PATTERN.exec(dateString);

  if (!match) {
    throw new RangeError(`Invalid UTC date: ${dateString}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid UTC date: ${dateString}`);
  }

  return date;
}
