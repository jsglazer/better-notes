/**
 * Pure grouping of serialized annotations under color-label headings.
 *
 * Annotations carry a user-assigned color label (Enhanced Notes' native color
 * labeling — see `getAnnotationColorLabel`). When a template requests grouped
 * output (`{% annotations grouped %}`), the host renders each annotation to HTML
 * and then groups the pieces by label into `<h2>Label</h2>` sections, ordered by
 * a configurable section order. This module is the pure (Zotero-free) core of
 * that grouping, so it is unit-tested directly.
 */

export interface AnnotationPiece {
  /** The annotation's color label ("" when its color has no assigned label). */
  colorLabel: string;
  /** The annotation's already-serialized HTML. */
  html: string;
}

/** Default section order (user-defined semantics, not color order). */
export const DEFAULT_SECTION_ORDER = [
  "Background",
  "Key",
  "Argument",
  "Error",
  "Source",
  "Data",
  "Definition",
  "Nav",
];

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Parse a comma-separated section-order pref; falls back to the default. */
export function parseSectionOrder(raw: string | undefined): string[] {
  const order = (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return order.length ? order : [...DEFAULT_SECTION_ORDER];
}

/**
 * Order the labels that are actually present: those named in `sectionOrder`
 * first (in that order), then any remaining present labels in encounter order.
 */
export function orderLabels(
  presentLabels: string[],
  sectionOrder: string[],
): string[] {
  const present = new Set(presentLabels);
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const label of sectionOrder) {
    if (present.has(label) && !seen.has(label)) {
      ordered.push(label);
      seen.add(label);
    }
  }
  for (const label of presentLabels) {
    if (!seen.has(label)) {
      ordered.push(label);
      seen.add(label);
    }
  }
  return ordered;
}

/**
 * Group serialized annotation pieces under `<h2>Label</h2>` sections, ordered by
 * `sectionOrder`. Annotations with no label are collected into a trailing
 * "Other" section. Returns the concatenated HTML.
 */
export function groupAnnotationPieces(
  pieces: AnnotationPiece[],
  sectionOrder: string[],
): string {
  const buckets = new Map<string, string[]>();
  const unlabeled: string[] = [];
  for (const p of pieces) {
    const label = (p.colorLabel || "").trim();
    if (!label) {
      unlabeled.push(p.html);
      continue;
    }
    if (!buckets.has(label)) {
      buckets.set(label, []);
    }
    buckets.get(label)!.push(p.html);
  }
  const ordered = orderLabels([...buckets.keys()], sectionOrder);
  let html = "";
  for (const label of ordered) {
    html += `<h2>${escapeHtml(label)}</h2>`;
    html += buckets.get(label)!.join("");
  }
  if (unlabeled.length) {
    html += `<h2>Other</h2>` + unlabeled.join("");
  }
  return html;
}
