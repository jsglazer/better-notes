/**
 * Template-editor autocomplete catalog + context resolver (U5).
 *
 * The single source of truth for "what can a template author type here": the
 * curated `item.*` / `note.*` data model (mirrors `model.ts`), the custom +
 * commonly-used built-in Liquid filters, and the supported tags. Both the live
 * CodeMirror autocomplete (`templateEditorCM.ts`) and any future fields-palette
 * sidebar read from these lists, so they can never drift apart.
 *
 * `computeCompletion(doc, pos)` is pure (no CodeMirror, no Zotero) — it takes the
 * whole document text + a cursor offset and returns the token span to replace and
 * the candidate entries, or null when the cursor isn't in a completable spot.
 * Unit-tested in Node alongside the other template modules.
 */

export type CompletionKind = "variable" | "field" | "filter" | "tag";

export interface CompletionEntry {
  /** Inserted text + primary display label. */
  label: string;
  /** Short right-aligned category/type hint. */
  detail: string;
  /** Longer description shown in the completion's info panel. */
  info: string;
  /** Drives the editor's completion icon. */
  kind: CompletionKind;
}

const v = (label: string, info: string): CompletionEntry => ({
  label,
  detail: "variable",
  info,
  kind: "variable",
});
const f = (label: string, info: string): CompletionEntry => ({
  label,
  detail: "field",
  info,
  kind: "field",
});
const filt = (label: string, info: string): CompletionEntry => ({
  label,
  detail: "filter",
  info,
  kind: "filter",
});
const tag = (label: string, info: string): CompletionEntry => ({
  label,
  detail: "tag",
  info,
  kind: "tag",
});

/** Top-level variables available in every item/text template context. */
export const VARIABLES: CompletionEntry[] = [
  v("item", "The primary item (first selected) — fields like item.title, item.authors."),
  v("items", "All selected items, e.g. {% for item in items %}…{% endfor %}."),
  v("note", "The target note — note.title, note.citekey, note.parentTitle, …"),
  v("now", 'The current date/time, e.g. {{ now | date: "%Y-%m-%d" }}.'),
];

/** Fields on an `item` (and on `items[i]`). Mirrors ItemModel in model.ts. */
export const ITEM_FIELDS: CompletionEntry[] = [
  f("title", "Item title."),
  f("authors", "Creators (alias of creators); loop with {% for a in item.authors %}."),
  f("creators", "Creators; each has firstName, lastName, name."),
  f("date", "Raw date field."),
  f("year", "4-digit year extracted from the date."),
  f("tags", "Array of tag strings."),
  f("abstract", "Abstract (abstractNote). Pipe through | oneline to flatten."),
  f("citekey", "Citation key (BBT → extra → citationKey field)."),
  f("collections", "Names of collections containing the item."),
  f("doi", "DOI."),
  f("url", "URL."),
  f("itemType", "Zotero item type name."),
  f("key", "Zotero item key."),
];

/** Fields on a `note`. Mirrors NoteModel in model.ts. */
export const NOTE_FIELDS: CompletionEntry[] = [
  f("title", "Note title."),
  f("tags", "Array of the note's tag strings."),
  f("key", "Note item key."),
  f("parentTitle", "Title of the note's parent item."),
  f("collections", "Names of collections containing the note/parent."),
  f("citekey", "Citation key of the note's parent item."),
];

/** Fields on a creator (item.authors[i] / loop var over authors). */
export const CREATOR_FIELDS: CompletionEntry[] = [
  f("name", '"Last, First" when both present, else whichever exists.'),
  f("firstName", "Given name."),
  f("lastName", "Family name."),
];

/** Liquid's `forloop` object inside a {% for %}. */
export const FORLOOP_FIELDS: CompletionEntry[] = [
  f("first", "True on the first iteration."),
  f("last", "True on the last iteration (e.g. {% unless forloop.last %}, {% endunless %})."),
  f("index", "1-based iteration number."),
  f("index0", "0-based iteration number."),
  f("length", "Total number of iterations."),
  f("rindex", "Iterations remaining (1-based)."),
];

/** Custom plugin filters + the commonly-used LiquidJS built-ins. */
export const FILTERS: CompletionEntry[] = [
  filt("year", "Custom: extract a 4-digit year from a date string."),
  filt("oneline", "Custom: collapse newlines to single spaces (abstract-friendly)."),
  filt("sanitize_filename", "Custom: replace filesystem-illegal chars + spaces with '-'."),
  filt("md", "Custom: render a Markdown string to note HTML (async, via the convert worker)."),
  filt("date", 'Built-in: format a date, e.g. | date: "%Y-%m-%d".'),
  filt("default", 'Built-in: fallback when the value is empty, e.g. | default: "n/a".'),
  filt("join", 'Built-in: join an array, e.g. item.tags | join: ", ".'),
  filt("split", "Built-in: split a string into an array."),
  filt("upcase", "Built-in: uppercase."),
  filt("downcase", "Built-in: lowercase."),
  filt("capitalize", "Built-in: capitalize the first character."),
  filt("strip", "Built-in: trim leading/trailing whitespace."),
  filt("strip_newlines", "Built-in: remove all newlines (no replacement)."),
  filt("truncate", "Built-in: shorten to N characters, e.g. | truncate: 80."),
  filt("truncatewords", "Built-in: shorten to N words."),
  filt("replace", 'Built-in: replace all, e.g. | replace: "a", "b".'),
  filt("size", "Built-in: length of a string or array."),
  filt("first", "Built-in: first element of an array."),
  filt("last", "Built-in: last element of an array."),
  filt("append", "Built-in: concatenate a string onto the end."),
  filt("prepend", "Built-in: concatenate a string onto the front."),
  filt("escape", "Built-in: HTML-escape."),
];

/** Supported Liquid tags (control flow + the plugin's render tags). */
export const TAGS: CompletionEntry[] = [
  tag("if", "Conditional: {% if cond %}…{% endif %}."),
  tag("unless", "Negative conditional: {% unless cond %}…{% endunless %}."),
  tag("elsif", "Else-if branch inside an {% if %}."),
  tag("else", "Else branch."),
  tag("endif", "Close an {% if %}."),
  tag("endunless", "Close an {% unless %}."),
  tag("for", "Loop: {% for item in items %}…{% endfor %}."),
  tag("endfor", "Close a {% for %}."),
  tag("assign", 'Set a variable: {% assign x = item.title %}.'),
  tag("capture", "Capture rendered output into a variable."),
  tag("comment", "Comment block: {% comment %}…{% endcomment %} (renders nothing)."),
  tag("endcomment", "Close a {% comment %}."),
  tag("annotations", "Plugin: emit the item's annotation HTML. `grouped` buckets by color label."),
];

export interface CompletionResult {
  /** Document offset where the replaced token begins. */
  from: number;
  /** Candidate entries to offer. */
  options: CompletionEntry[];
}

/** Map a property-base identifier to the field list it exposes, or null. */
function resolveBaseType(
  base: string,
  loopVars: Map<string, CompletionEntry[]>,
): CompletionEntry[] | null {
  if (/(?:^|\.)(authors|creators)(?:\[\d+\])?$/.test(base)) {
    return CREATOR_FIELDS;
  }
  if (base === "item" || /^items\[\d+\]$/.test(base)) {
    return ITEM_FIELDS;
  }
  if (base === "note") {
    return NOTE_FIELDS;
  }
  if (base === "forloop") {
    return FORLOOP_FIELDS;
  }
  return loopVars.get(base) ?? null;
}

/**
 * Scan the document for `{% for X in SOURCE %}` and map each loop variable X to
 * the field list its element type exposes, so `X.` completes correctly inside
 * the loop (e.g. `{% for a in item.authors %}` → a.name/firstName/lastName).
 */
function scanLoopVars(doc: string): Map<string, CompletionEntry[]> {
  const map = new Map<string, CompletionEntry[]>();
  const re = /\{%-?\s*for\s+(\w+)\s+in\s+([\w.[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(doc))) {
    const [, name, source] = m;
    if (/(?:authors|creators)(?:\[\d+\])?$/.test(source)) {
      map.set(name, CREATOR_FIELDS);
    } else if (source === "items") {
      map.set(name, ITEM_FIELDS);
    }
    // other sources (e.g. item.tags → strings) expose no fields
  }
  return map;
}

/**
 * Resolve what to complete at `pos` in `doc`. Returns the token span to replace
 * and the candidate entries, or null when the cursor is not inside an open
 * `{{ … }}` / `{% … %}` at a completable position. Pure.
 */
export function computeCompletion(
  doc: string,
  pos: number,
): CompletionResult | null {
  const before = doc.slice(0, pos);

  // Locate the innermost still-open Liquid delimiter before the cursor.
  const outIdx = before.lastIndexOf("{{");
  const tagIdx = before.lastIndexOf("{%");
  const outOpen = outIdx !== -1 && before.indexOf("}}", outIdx) === -1;
  const tagOpen = tagIdx !== -1 && before.indexOf("%}", tagIdx) === -1;

  let openIdx: number;
  let isTag: boolean;
  if (outOpen && (!tagOpen || outIdx > tagIdx)) {
    openIdx = outIdx;
    isTag = false;
  } else if (tagOpen) {
    openIdx = tagIdx;
    isTag = true;
  } else {
    return null;
  }

  const region = before.slice(openIdx + 2);

  // Tag-name position: inside {% … %} with no whitespace yet → suggest tags.
  if (isTag) {
    const nameMatch = region.match(/^\s*(\w*)$/);
    if (nameMatch) {
      return { from: pos - nameMatch[1].length, options: TAGS };
    }
    // otherwise fall through: complete variables/filters in the tag expression
  }

  // Filter position: a `|` appears before the cursor within this delimiter.
  const lastPipe = region.lastIndexOf("|");
  if (lastPipe !== -1) {
    const seg = region.slice(lastPipe + 1);
    const word = seg.match(/[\w]*$/)![0];
    return { from: pos - word.length, options: FILTERS };
  }

  // Variable / property position: grab the trailing identifier path.
  const path = region.match(/[\w.[\]]*$/)![0];
  if (path.includes(".")) {
    const lastDot = path.lastIndexOf(".");
    const base = path.slice(0, lastDot);
    const frag = path.slice(lastDot + 1);
    const fields = resolveBaseType(base, scanLoopVars(doc));
    if (!fields) {
      return null;
    }
    return { from: pos - frag.length, options: fields };
  }
  return { from: pos - path.length, options: VARIABLES };
}
