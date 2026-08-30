/**
 * Best-effort transpiler: legacy JavaScript note template → sandboxed Liquid (U6).
 *
 * The legacy engine (removed in U4) evaluated arbitrary JS embedded as `${ expr }`
 * (one-line) and `${{ … }}$` (multi-line) against raw Zotero items, configured by
 * `// @pragma` lines and `// @stage-begin/-end` loop markers. Liquid templates
 * instead read a curated data model (`item.*` / `note.*`, see model.ts) and carry
 * a sentinel header (`<!--liquid-->` / `<!--markdown-->` / `<!--addTags:-->`).
 *
 * Arbitrary JS cannot be transpiled in general, so this converter is deliberately
 * conservative: it maps the well-known field/creator/tag/date idioms that make up
 * the overwhelming majority of real templates, and wraps anything it does NOT
 * recognise in a visible `{% comment %}` flag (rendered as nothing, never as broken
 * markup) so the user can finish it by hand. The result is always valid Liquid.
 *
 * Pure — no Zotero access — so it is unit-tested in Node alongside the other
 * template modules.
 */

export interface LegacyConvertResult {
  /** The converted Liquid template (always begins with `<!--liquid-->`). */
  liquid: string;
  /** True when the input was already a Liquid template (returned unchanged). */
  alreadyLiquid: boolean;
  /** Count of legacy expressions auto-converted to Liquid. */
  mapped: number;
  /** Count of legacy expressions flagged for manual translation. */
  manual: number;
  /** Human-readable summary lines (decisions + assumptions). */
  notes: string[];
}

/**
 * Zotero `getField("key")` → curated `item.*` model property. Only fields the
 * model actually exposes are listed; any other field key falls through to a
 * manual flag (silently mapping it would render empty and mislead the user).
 */
const FIELD_MAP: Record<string, string> = {
  title: "title",
  date: "date",
  abstractNote: "abstract",
  DOI: "doi",
  url: "url",
  citationKey: "citekey",
  itemType: "itemType",
  key: "key",
};

const LIQUID_SENTINEL = "<!--liquid-->";

/** True when the first non-blank line is the Liquid opt-in sentinel. */
function isAlreadyLiquid(text: string): boolean {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    return line.toLowerCase() === LIQUID_SENTINEL;
  }
  return false;
}

interface ExprResult {
  /** Liquid replacement, or null if the expression could not be recognised. */
  liquid: string | null;
}

/** Escape a join separator for safe inline emission inside a `{% for %}`. */
function loopJoin(bodyExpr: string, listExpr: string, sep: string): string {
  // `unless forloop.last` puts the separator between items only.
  return `{% for x in ${listExpr} %}${bodyExpr}{% unless forloop.last %}${sep}{% endunless %}{% endfor %}`;
}

/**
 * Translate a single legacy one-line expression (the inside of `${ … }`) to
 * Liquid. Returns `{ liquid: null }` when the shape is not recognised so the
 * caller can flag it. `topItem` maps to `item`, `targetNoteItem` to `note`.
 */
export function convertExpression(rawExpr: string): ExprResult {
  const expr = rawExpr.trim();

  // topItem.getField("X") / topItem.getField('X')
  let m = expr.match(/^topItem\s*\.\s*getField\(\s*['"]([^'"]+)['"]\s*\)$/);
  if (m) {
    const mapped = FIELD_MAP[m[1]];
    return { liquid: mapped ? `{{ item.${mapped} }}` : null };
  }

  // topItem.citationKey  (optionally the common `? … : ""` guard)
  if (/^topItem\s*\.\s*citationKey\b/.test(expr)) {
    return { liquid: "{{ item.citekey }}" };
  }

  // topItem.key
  if (/^topItem\s*\.\s*key$/.test(expr)) {
    return { liquid: "{{ item.key }}" };
  }

  // topItem.itemType
  if (/^topItem\s*\.\s*itemType$/.test(expr)) {
    return { liquid: "{{ item.itemType }}" };
  }

  // topItem.getCreators()…  — authors, with the separator from a trailing
  // .join("…") (default "; "), and a name shape inferred from the .map() body.
  if (/^topItem\s*\.\s*getCreators\(\)/.test(expr)) {
    const sep = expr.match(/\.join\(\s*['"]([^'"]*)['"]\s*\)/);
    const sepStr = sep ? sep[1] : "; ";
    let nameExpr = "{{ x.name }}";
    if (/firstName[\s\S]*lastName/.test(expr)) {
      nameExpr = "{{ x.firstName }} {{ x.lastName }}";
    } else if (/lastName[\s\S]*firstName/.test(expr)) {
      nameExpr = "{{ x.lastName }}, {{ x.firstName }}";
    }
    return { liquid: loopJoin(nameExpr, "item.authors", sepStr) };
  }

  // topItem.getTags()… — tags; separator from trailing .join("…") (default ", ").
  if (/^topItem\s*\.\s*getTags\(\)/.test(expr)) {
    const sep = expr.match(/\.join\(\s*['"]([^'"]*)['"]\s*\)/);
    const sepStr = sep ? sep[1] : ", ";
    return { liquid: loopJoin("{{ x }}", "item.tags", sepStr) };
  }

  // targetNoteItem.getNoteTitle()
  if (/^targetNoteItem\s*\.\s*getNoteTitle\(\)/.test(expr)) {
    return { liquid: "{{ note.title }}" };
  }

  // new Date()…  — current date/time. toLocaleString/toISOString/etc. can't be
  // matched precisely, so emit a sensible default and let the note flag it.
  if (/^new\s+Date\s*\(/.test(expr)) {
    return { liquid: '{{ now | date: "%Y-%m-%d %H:%M" }}' };
  }

  return { liquid: null };
}

/** Wrap an un-translatable legacy fragment in a visible (no-output) flag. */
function manualFlag(original: string): string {
  return `{% comment %} BN-MIGRATE: translate manually using item.*/note.* — original legacy code:\n${original}\n{% endcomment %}`;
}

/**
 * Replace every `${{ … }}$` block and `${ … }` expression in `body`. Blocks are
 * always flagged (arbitrary multi-line JS); one-line expressions are converted
 * when recognised, else flagged. Brace-aware scan so object/arrow bodies inside
 * `${ … }` don't truncate early.
 */
function replaceExpressions(body: string): {
  out: string;
  mapped: number;
  manual: number;
} {
  let mapped = 0;
  let manual = 0;

  // 1) Multi-line blocks first: ${{ … }}$  (literal close delimiter).
  let work = "";
  let i = 0;
  while (i < body.length) {
    const start = body.indexOf("${{", i);
    if (start === -1) {
      work += body.slice(i);
      break;
    }
    const end = body.indexOf("}}$", start + 3);
    if (end === -1) {
      // Unterminated — leave the rest verbatim.
      work += body.slice(i);
      break;
    }
    work += body.slice(i, start);
    const inner = body.slice(start + 3, end).trim();
    work += manualFlag(`\${{\n${inner}\n}}$`);
    manual++;
    i = end + 3;
  }

  // 2) One-line expressions: ${ … } with brace counting (skip any leftover ${{).
  let out = "";
  i = 0;
  while (i < work.length) {
    if (
      work[i] === "$" &&
      work[i + 1] === "{" &&
      work[i + 2] !== "{" // a `${{` here would be a stray; treat as literal
    ) {
      let depth = 1;
      let j = i + 2;
      for (; j < work.length && depth > 0; j++) {
        if (work[j] === "{") depth++;
        else if (work[j] === "}") depth--;
      }
      if (depth === 0) {
        const inner = work.slice(i + 2, j - 1);
        const { liquid } = convertExpression(inner);
        if (liquid !== null) {
          out += liquid;
          mapped++;
        } else {
          out += manualFlag(`\${${inner}}`);
          manual++;
        }
        i = j;
        continue;
      }
    }
    out += work[i];
    i++;
  }

  return { out, mapped, manual };
}

/**
 * Convert a legacy JS template to Liquid. `type` ("item" | "text" | "unknown")
 * affects only loop wrapping: an item template that uses the per-item `topItem`
 * variable is wrapped in `{% for item in items %}` so multi-item runs still work.
 */
export function convertLegacyTemplate(
  text: string,
  type: "item" | "text" | "unknown" = "item",
): LegacyConvertResult {
  if (isAlreadyLiquid(text)) {
    return {
      liquid: text,
      alreadyLiquid: true,
      mapped: 0,
      manual: 0,
      notes: ["Already a Liquid template — no changes made."],
    };
  }

  const notes: string[] = [];
  let markdown = false;
  const metadata: string[] = [];

  // --- 1. Strip pragma lines (whole lines starting with `// @`). ----------
  const stageMarkers = {
    beforeloop: { begin: -1, end: -1 },
    default: { begin: -1, end: -1 },
    afterloop: { begin: -1, end: -1 },
  };
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const pragma = line.match(/^\/\/\s*@([\w-]+)(?:\s+(.*))?$/);
    if (!pragma) {
      kept.push(raw);
      continue;
    }
    const name = pragma[1].toLowerCase();
    const arg = (pragma[2] || "").trim();
    if (name === "use-markdown") {
      markdown = true;
    } else if (name === "use-refresh") {
      notes.push(
        "Dropped `// @use-refresh` — refresh is now handled by the Update-from-template feature, not a pragma.",
      );
    } else if (name === "author" || name === "link") {
      metadata.push(`${name}: ${arg}`);
    } else {
      const stage = name.match(/^(beforeloop|default|afterloop)-(begin|end)$/);
      if (stage) {
        stageMarkers[stage[1] as keyof typeof stageMarkers][
          stage[2] as "begin" | "end"
        ] = kept.length;
      } else {
        notes.push(`Dropped unrecognised pragma \`// @${name}\`.`);
      }
    }
    // pragma lines are not kept in the body
  }

  // --- 2. Re-assemble body, honouring stage markers for loop wrapping. -----
  const hasStages =
    stageMarkers.default.begin !== -1 ||
    stageMarkers.beforeloop.begin !== -1 ||
    stageMarkers.afterloop.begin !== -1;

  let body: string;
  let wrappedLoop = false;
  if (hasStages) {
    const seg = (a: number, b: number) =>
      a === -1 ? "" : kept.slice(a, b === -1 ? kept.length : b).join("\n");
    const before = seg(
      stageMarkers.beforeloop.begin,
      stageMarkers.beforeloop.end,
    );
    const loop = seg(stageMarkers.default.begin, stageMarkers.default.end);
    const after = seg(stageMarkers.afterloop.begin, stageMarkers.afterloop.end);
    const parts: string[] = [];
    if (before.trim()) parts.push(before);
    if (loop.trim()) {
      parts.push(`{% for item in items %}\n${loop}\n{% endfor %}`);
      wrappedLoop = true;
    }
    if (after.trim()) parts.push(after);
    body = parts.join("\n");
    notes.push(
      "Mapped `beforeloop`/`default`/`afterloop` stages: the default stage became a `{% for item in items %}` loop; before/after content renders once. Review the loop boundaries.",
    );
  } else {
    body = kept.join("\n");
    // No stage markers: legacy ran the body once per selected item. Wrap in a
    // per-item loop only when the body actually used the per-item variable.
    if (type !== "text" && /\btopItem\b/.test(body)) {
      body = `{% for item in items %}\n${body}\n{% endfor %}`;
      wrappedLoop = true;
      notes.push(
        "Wrapped the template in `{% for item in items %}` so multi-item runs still work (legacy ran the body once per item). For single-item templates you can remove the loop and use `item.*` directly.",
      );
    }
  }

  // --- 3. Translate expressions. ------------------------------------------
  const { out, mapped, manual } = replaceExpressions(body);
  body = out;

  // --- 4. Assemble the Liquid header + body. ------------------------------
  const head: string[] = [LIQUID_SENTINEL];
  if (markdown) head.push("<!--markdown-->");
  const lead: string[] = [];
  if (metadata.length) {
    lead.push(`{% comment %} ${metadata.join(" · ")} {% endcomment %}`);
  }
  const liquid = [head.join("\n"), ...lead, body].join("\n");

  if (manual > 0) {
    notes.push(
      `${manual} expression(s) could not be auto-converted and were flagged with \`{% comment %} BN-MIGRATE … {% endcomment %}\`. Search the template for "BN-MIGRATE" and translate each by hand.`,
    );
  }
  notes.push(
    `Converted ${mapped} expression(s) automatically.` +
      (wrappedLoop ? " Body wrapped in a per-item loop." : ""),
  );

  return { liquid, alreadyLiquid: false, mapped, manual, notes };
}
