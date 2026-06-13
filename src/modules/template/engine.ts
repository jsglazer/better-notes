import { Liquid } from "liquidjs";
import { CUSTOM_FILTERS } from "./filters";

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
