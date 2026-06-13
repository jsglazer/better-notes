import { Liquid } from "liquidjs";
import { CUSTOM_FILTERS } from "./filters";
import { parseDirectives, TemplateDirectives } from "./directives";

/**
 * The sandboxed template rendering engine (U4) — replaces the legacy
 * `new AsyncFunction` evaluator.
 *
 * A template is Liquid markup rendered against a plain data context (the curated
 * model from `model.ts`). Nothing in a template can reach the file system, the
 * network, or mutate Zotero — only the provided data and the registered
 * filters/tags. Side effects a template needs (e.g. adding a tag) are expressed
 * as front-matter directives applied by the host AFTER render (see
 * `directives.ts`), never by the template itself.
 *
 * Rendering is pure with respect to Zotero: the caller builds the context (via
 * `buildItemModel`/`buildNoteModel`) and passes it in, so rendering runs
 * anywhere — including Node, where it is unit-tested. The Zotero-bound pieces
 * (async `md` filter via the convert worker, and the `{% annotations %}` render
 * tag with image embedding) are registered in a later, live-verified U4 step.
 */

let engine: Liquid | undefined;

function getEngine(): Liquid {
  if (engine) {
    return engine;
  }
  // strictVariables/strictFilters default to false: an unknown variable renders
  // empty rather than aborting the whole note — templates are documents.
  engine = new Liquid();
  for (const [name, fn] of Object.entries(CUSTOM_FILTERS)) {
    engine.registerFilter(
      name,
      fn as (value: unknown, ...args: unknown[]) => unknown,
    );
  }
  return engine;
}

/**
 * Metadata + body extracted from a Liquid template's leading sentinel-comment
 * header. New templates opt into the Liquid engine with a `<!--liquid-->` first
 * line; further `<!--flag-->` / `<!--key: value-->` lines configure rendering and
 * carry directives. This keeps new (sandboxed) templates unambiguously
 * distinguishable from legacy JS templates during the transition.
 */
export interface LiquidTemplateMeta {
  /** True when the template opted into the Liquid engine. */
  isLiquid: boolean;
  /** Output is Markdown → convert to HTML after render. */
  markdown: boolean;
  /** Post-render side effects (e.g. addTags). */
  directives: TemplateDirectives;
  /** Template body with the sentinel header stripped. */
  body: string;
}

const SENTINEL_RE = /^<!--\s*([a-zA-Z]+)\s*(?::\s*(.*?))?\s*-->$/;

/**
 * Parse the leading sentinel-comment header of a template. If the first
 * non-blank line is not `<!--liquid-->`, the template is treated as legacy
 * (`isLiquid: false`, body unchanged). Pure — no Zotero access; unit-tested.
 */
export function parseLiquidTemplate(text: string): LiquidTemplateMeta {
  const meta: LiquidTemplateMeta = {
    isLiquid: false,
    markdown: false,
    directives: { addTags: [] },
    body: text,
  };
  const lines = text.split(/\r?\n/);
  const header: Record<string, unknown> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") {
      continue;
    }
    const m = line.match(SENTINEL_RE);
    if (!m) {
      break;
    }
    const key = m[1].toLowerCase();
    const val = m[2];
    if (key === "liquid") {
      meta.isLiquid = true;
    } else if (key === "markdown") {
      meta.markdown = true;
    } else if (key === "addtags" && val) {
      header.addTags = val.split(",").map((s) => s.trim());
    }
    // Unknown sentinels are ignored.
  }
  if (!meta.isLiquid) {
    return meta;
  }
  meta.directives = parseDirectives(header);
  meta.body = lines.slice(i).join("\n");
  return meta;
}

/** Render a Liquid template string against a context. May throw on bad markup. */
export async function renderTemplate(
  templateText: string,
  context: Record<string, unknown> = {},
): Promise<string> {
  return await getEngine().parseAndRender(templateText, context);
}

/**
 * Render but never throw. On a template error returns `{ ok: false }` with a
 * human-readable message — used for the editor preview (mirrors the legacy
 * dryRun behavior, minus the crash risk).
 */
export async function renderTemplateSafe(
  templateText: string,
  context: Record<string, unknown> = {},
): Promise<{ ok: boolean; output: string }> {
  try {
    return { ok: true, output: await renderTemplate(templateText, context) };
  } catch (e) {
    return { ok: false, output: `Template error: ${String(e)}` };
  }
}
