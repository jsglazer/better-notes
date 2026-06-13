/**
 * Front-matter "directives": declarative side effects a template may request,
 * which the (sandboxed) engine applies AFTER rendering. Templates themselves
 * stay pure — the engine performs the write. Today the only directive is
 * `addTags`, the single write the current template set needs (it replaces the
 * `targetNoteItem.addTag(...)` + `saveTx()` side effect inside `[item]ItemNoteMD05`).
 *
 * Parsing is pure and unit-tested. Applying (a Zotero write) is implemented here
 * so the write surface lives in one place, but is not yet wired into any engine
 * — U4 calls {@link applyDirectives} after a render.
 */

export interface TemplateDirectives {
  /** Tags to add to the target note after rendering. */
  addTags: string[];
}

/**
 * Extract directives from a parsed front-matter object. Accepts a string or
 * string[] for `addTags`; trims, drops empties, de-dupes (order preserved).
 * Pure — no Zotero access.
 */
export function parseDirectives(frontmatter: unknown): TemplateDirectives {
  const out: TemplateDirectives = { addTags: [] };
  if (!frontmatter || typeof frontmatter !== "object") {
    return out;
  }
  const raw = (frontmatter as Record<string, unknown>).addTags;
  const candidates: unknown[] =
    typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  for (const v of candidates) {
    const t = String(v ?? "").trim();
    if (t) {
      out.addTags.push(t);
    }
  }
  out.addTags = Array.from(new Set(out.addTags));
  return out;
}

/**
 * Apply directives to a note item (Zotero write). NOT yet wired — U4 invokes
 * this after rendering a template against `targetNoteItem`. `addTag` is
 * idempotent, so re-applying is safe.
 */
export async function applyDirectives(
  noteItem: Zotero.Item,
  directives: TemplateDirectives,
): Promise<void> {
  if (!noteItem?.isNote?.() || directives.addTags.length === 0) {
    return;
  }
  for (const tag of directives.addTags) {
    noteItem.addTag(tag);
  }
  await noteItem.saveTx();
}
