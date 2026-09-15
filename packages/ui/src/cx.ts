/**
 * Class name joiner.
 *
 * Not clsx: every call site here passes strings and short-circuits, so the
 * dependency would buy nothing but a bundle entry.
 */
export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
