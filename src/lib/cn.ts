/**
 * Tiny conditional class-name joiner.
 *
 * The project deliberately avoids `clsx`/`tailwind-merge`; components only
 * need to combine their own base classes with caller-supplied overrides.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
