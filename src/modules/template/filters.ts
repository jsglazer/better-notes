/**
 * Custom template filters for the (future, U4) sandboxed template engine.
 *
 * These are pure and dependency-free so they can be unit-tested standalone and
 * registered with any engine. NOTE: `date`, `join`, `strip_newlines`, `upcase`,
 * `truncate`, etc. are LiquidJS built-ins and are intentionally NOT reimplemented
 * here — only filters the engine lacks live in this file. The async `md` filter
 * (markdown → HTML via the convert worker) is wired in U4 because it needs
 * runtime APIs and is therefore not part of this pure layer.
 *
 * Filters follow the engine convention: value first, then any arguments.
 */

/** Extract a 4-digit year from a date-ish string. Empty string if none found. */
export function year(value: unknown): string {
  const s = value == null ? "" : String(value);
  const m = s.match(/\d{4}/);
  return m ? m[0] : "";
}

/**
 * Replace characters that are illegal in file names (and spaces) with `-`.
 * Matches the existing `[ExportMDFileNameV2]` behavior exactly so generated
 * filenames stay stable across the engine swap.
 */
export function sanitizeFilename(value: unknown): string {
  const s = value == null ? "" : String(value);
  return s.replace(/[/\\?%*:|"<> ]/g, "-");
}

/** Map of `liquidName → fn`, consumed by U4 to register with the engine. */
export const CUSTOM_FILTERS = {
  year,
  sanitize_filename: sanitizeFilename,
} as const;
