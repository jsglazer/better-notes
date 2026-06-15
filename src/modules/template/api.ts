import { itemPicker } from "../../utils/itemPicker";
import { getString } from "../../utils/locale";
import { fill, slice } from "../../utils/str";
import { showHint } from "../../utils/hint";
import { parseLiquidTemplate, renderTemplate } from "./engine";
import {
  buildItemModel,
  buildNoteModel,
  collectItemAnnotations,
} from "./model";
import { applyDirectives } from "./directives";

export {
  runTextTemplate,
  runItemTemplate,
  runQuickInsertTemplate,
  runQuickImportTemplate,
  runQuickNoteTemplate,
  runLiquidIfLiquid,
};

/**
 * The legacy `AsyncFunction` template engine (arbitrary-JS eval + `${{…}}$`
 * rewriter + `// @` pragma/stage machinery) was removed in U4 — templates are
 * now sandboxed Liquid. A template that never opted into Liquid
 * (`<!--liquid-->`) can no longer be executed; instead of evaluating arbitrary
 * JS (or crashing), every runner returns this clear, safe notice so the user
 * knows to convert it. Doubles as the editor-preview message.
 */
function legacyNotice(key: string): string {
  return `⚠ Template "${key}" uses the removed JavaScript engine. Convert it to Liquid by adding "<!--liquid-->" as the first line.`;
}

async function runTextTemplate(
  key: string,
  options: {
    targetNoteId?: number;
    dryRun?: boolean;
  } = {},
) {
  const { targetNoteId, dryRun } = options;
  const targetNoteItem = Zotero.Items.get(targetNoteId || -1);

  // [text] templates are Liquid-only since U4; anything else gets the notice.
  const liquidMeta = parseLiquidTemplate(
    addon.api.template.getTemplateText(key),
  );
  if (liquidMeta.isLiquid) {
    return await runTextTemplateLiquid(liquidMeta, targetNoteItem, { dryRun });
  }
  return legacyNotice(key);
}

async function runItemTemplate(
  key: string,
  options: {
    itemIds?: number[];
    targetNoteId?: number;
    dryRun?: boolean;
  } = {},
): Promise<string> {
  // Renders an `[item]` template against the curated Liquid context built in
  // runItemTemplateLiquid (`item`, `items`, `note`, `now`). The legacy
  // beforeloop/default/afterloop stage machinery + `sharedObj`/`copyNoteImage`
  // globals were removed with the JS engine in U4.
  let { itemIds } = options;
  const { targetNoteId, dryRun } = options;
  if (!itemIds) {
    itemIds = await getItemTemplateData();
  }
  if (itemIds?.length === 0) {
    return "";
  }

  let targetNoteItem: Zotero.Item | undefined = Zotero.Items.get(
    targetNoteId || -1,
  );
  if (!targetNoteItem) {
    targetNoteItem = undefined;
  }

  const items = itemIds?.map((id) => Zotero.Items.get(id)) || [];

  // [item] templates are Liquid-only since U4; anything else gets the notice.
  const liquidMeta = parseLiquidTemplate(
    addon.api.template.getTemplateText(key),
  );
  if (liquidMeta.isLiquid) {
    return await runItemTemplateLiquid(liquidMeta, items, targetNoteItem, {
      dryRun,
    });
  }
  return legacyNotice(key);
}

/**
 * Render a Liquid template body to HTML, never throwing. On error: a dry-run
 * (preview) returns the error text (Liquid messages include line/column), while
 * a live render shows a non-blocking hint and returns "" — vs the legacy engine's
 * blocking `alert()`. Returns `ok` so callers can skip post-render side effects
 * (e.g. directives) when the render failed.
 */
async function renderLiquid(
  meta: import("./engine").LiquidTemplateMeta,
  context: Record<string, unknown>,
  dryRun?: boolean,
): Promise<{ ok: boolean; html: string }> {
  try {
    const rendered = await renderTemplate(meta.body, context);
    const html = meta.markdown
      ? await addon.api.convert.md2html(rendered)
      : rendered;
    return { ok: true, html };
  } catch (e) {
    if (dryRun) {
      return { ok: false, html: `Template Preview Error: ${String(e)}` };
    }
    showHint(`Template error: ${String(e)}`);
    return { ok: false, html: "" };
  }
}

/**
 * Flip helper for system templates invoked through the legacy `runTemplate`
 * call sites (U4). If `key`'s template opted into Liquid (`<!--liquid-->`),
 * render it through the sandboxed engine against the given **curated** context
 * (callers pass primitives + curated models, never raw Zotero items) and return
 * the output. Returns `null` when the template is still legacy OR when a live
 * render fails — so the caller keeps its existing fallback (e.g. the original
 * `mdContent`) and a bad template can never wipe exported content.
 */
async function runLiquidIfLiquid(
  key: string,
  context: Record<string, unknown>,
  options: { dryRun?: boolean } = {},
): Promise<string | null> {
  const meta = parseLiquidTemplate(addon.api.template.getTemplateText(key));
  if (!meta.isLiquid) {
    return null;
  }
  const { ok, html } = await renderLiquid(meta, context, options.dryRun);
  return ok ? html : null;
}

/**
 * Render an `[item]` template through the sandboxed Liquid engine (U4).
 *
 * Builds the curated `item`/`items`/`note` context (no raw Zotero API exposed to
 * the template), renders, converts Markdown → HTML when the template declared
 * `<!--markdown-->`, and applies any post-render directives (e.g. `addTags`) to
 * the target note — unless this is a dry-run preview or the render failed.
 */
async function runItemTemplateLiquid(
  meta: import("./engine").LiquidTemplateMeta,
  items: Zotero.Item[],
  targetNoteItem: Zotero.Item | undefined,
  options: { dryRun?: boolean } = {},
): Promise<string> {
  const itemModels = await Promise.all(items.map((it) => buildItemModel(it)));
  const noteModel = targetNoteItem
    ? await buildNoteModel(targetNoteItem)
    : null;
  const context: Record<string, unknown> = {
    items: itemModels,
    item: itemModels[0] ?? null,
    note: noteModel,
    now: new Date(),
  };

  // `{% annotations %}` support: pre-compute the primary item's annotation HTML
  // (with image embedding into the target note on a live run) and hand it to the
  // tag via the context. Only runs when the template actually uses the tag, so
  // templates without it never pay the worker round-trip. On a dry-run preview
  // we omit the note so no images are imported.
  if (/\{%-?\s*annotations\b/.test(meta.body)) {
    // `{% annotations grouped %}` → bucket under color-label `<h2>` sections.
    const grouped = /\{%-?\s*annotations\s+grouped\b/.test(meta.body);
    const primary = items[0];
    let annotationsHTML = "";
    if (primary) {
      try {
        const annots = collectItemAnnotations(primary);
        annotationsHTML = await addon.api.convert.annotations2html(annots, {
          noteItem: options.dryRun ? undefined : targetNoteItem,
          groupByColorLabel: grouped,
        });
      } catch (e) {
        ztoolkit.log("annotations tag pre-compute failed", e);
      }
    }
    context.__annotationsHTML__ = annotationsHTML;
  }

  const { ok, html } = await renderLiquid(meta, context, options.dryRun);
  if (ok && !options.dryRun && targetNoteItem && meta.directives.addTags.length) {
    await applyDirectives(targetNoteItem, meta.directives);
  }
  return html;
}

/**
 * Render a `[text]` template through the sandboxed Liquid engine (U4). Context is
 * the target `note` model (when a target note exists) plus `now`. Markdown
 * conversion + directives handled as in {@link runItemTemplateLiquid}.
 */
async function runTextTemplateLiquid(
  meta: import("./engine").LiquidTemplateMeta,
  targetNoteItem: Zotero.Item | undefined,
  options: { dryRun?: boolean } = {},
): Promise<string> {
  const noteItem =
    targetNoteItem && targetNoteItem.isNote && targetNoteItem.isNote()
      ? targetNoteItem
      : undefined;
  const context = {
    note: noteItem ? await buildNoteModel(noteItem) : null,
    now: new Date(),
  };

  const { ok, html } = await renderLiquid(meta, context, options.dryRun);
  if (ok && !options.dryRun && noteItem && meta.directives.addTags.length) {
    await applyDirectives(noteItem, meta.directives);
  }
  return html;
}

async function runQuickInsertTemplate(
  noteItem: Zotero.Item,
  targetNoteItem: Zotero.Item | undefined,
  options: {
    lineIndex?: number;
    sectionName?: string;
    selectionText?: string;
    // For internal use, store the link result
    _internal?: any;
    dryRun?: boolean;
  } = {},
) {
  if (!noteItem) return "";
  const link = addon.api.convert.note2link(noteItem, {
    lineIndex: options.lineIndex,
    sectionName: options.sectionName,
    selectionText: options.selectionText,
  });
  if (!link) {
    ztoolkit.log("No link found");
    return "";
  }

  if (options._internal) {
    options._internal.link = link;
  }
  const noteTitle = noteItem.getNoteTitle().trim();
  let linkText: string;
  if (options.selectionText) {
    linkText = noteTitle ? `#${options.selectionText} - ${noteTitle}` : link;
  } else if (options.sectionName) {
    linkText = noteTitle ? `${options.sectionName} - ${noteTitle}` : link;
  } else if (options.lineIndex) {
    linkText = noteTitle ? `L${options.lineIndex} - ${noteTitle}` : link;
  } else {
    linkText = noteTitle || link;
  }

  // Route a Liquid (`<!--liquid-->`) [QuickInsertV3] through the sandboxed
  // engine with a curated context — only primitives + the note model, no raw
  // Zotero items. A non-Liquid template returns the convert-to-Liquid notice.
  const liquidMeta = parseLiquidTemplate(
    addon.api.template.getTemplateText("[QuickInsertV3]"),
  );
  if (liquidMeta.isLiquid) {
    const context = {
      link,
      linkText,
      lineIndex: options.lineIndex ?? null,
      sectionName: options.sectionName ?? null,
      selectionText: options.selectionText ?? null,
      note:
        targetNoteItem && targetNoteItem.isNote && targetNoteItem.isNote()
          ? await buildNoteModel(targetNoteItem)
          : null,
      now: new Date(),
    };
    const { html } = await renderLiquid(liquidMeta, context, options.dryRun);
    return html;
  }

  return legacyNotice("[QuickInsertV3]");
}

/**
 * Run [QuickImportV2] (embed a linked note). Routes a Liquid template through the
 * sandboxed engine: the host pre-computes the linked note's embedded HTML via
 * `link2html` (which needs the target note for image embedding + the dryRun
 * flag) and exposes it to the template as `linkContent`; the template stays
 * pure. A non-Liquid template returns the convert-to-Liquid notice.
 */
async function runQuickImportTemplate(
  link: string,
  targetNoteItem: Zotero.Item | undefined,
  options: { dryRun?: boolean } = {},
): Promise<string> {
  const liquidMeta = parseLiquidTemplate(
    addon.api.template.getTemplateText("[QuickImportV2]"),
  );
  if (liquidMeta.isLiquid) {
    let linkContent = "";
    try {
      linkContent = await addon.api.convert.link2html(link, {
        noteItem: targetNoteItem,
        dryRun: options.dryRun,
      });
    } catch (e) {
      ztoolkit.log("link2html pre-compute failed", e);
    }
    const context = {
      link,
      linkContent,
      note:
        targetNoteItem && targetNoteItem.isNote && targetNoteItem.isNote()
          ? await buildNoteModel(targetNoteItem)
          : null,
      now: new Date(),
    };
    const { html } = await renderLiquid(liquidMeta, context, options.dryRun);
    return html;
  }

  return legacyNotice("[QuickImportV2]");
}

/**
 * Run [QuickNoteV5] (note created from a single annotation). A Liquid template
 * gets the host-pre-computed comment HTML (`commentHTML` — the annotation's
 * Markdown comment via md2html, only when present, matching legacy) plus the
 * annotation's own HTML through the shared `{% annotations %}` tag
 * (`__annotationsHTML__`, rendered with `ignoreComment` so the comment isn't
 * duplicated). The template stays pure. A non-Liquid template returns the notice.
 */
async function runQuickNoteTemplate(
  annotationItem: Zotero.Item,
  topItem: Zotero.Item | undefined,
  targetNoteItem: Zotero.Item | undefined,
  options: { dryRun?: boolean } = {},
): Promise<string> {
  const liquidMeta = parseLiquidTemplate(
    addon.api.template.getTemplateText("[QuickNoteV5]"),
  );
  if (liquidMeta.isLiquid) {
    let commentHTML = "";
    const comment = annotationItem.annotationComment;
    if (comment) {
      try {
        commentHTML = await addon.api.convert.md2html(comment);
      } catch (e) {
        ztoolkit.log("QuickNote comment md2html failed", e);
      }
    }
    let annotationsHTML = "";
    try {
      annotationsHTML = await addon.api.convert.annotations2html(
        [annotationItem],
        { noteItem: targetNoteItem, ignoreComment: true },
      );
    } catch (e) {
      ztoolkit.log("QuickNote annotations2html failed", e);
    }
    const context = {
      commentHTML,
      __annotationsHTML__: annotationsHTML,
      note:
        targetNoteItem && targetNoteItem.isNote && targetNoteItem.isNote()
          ? await buildNoteModel(targetNoteItem)
          : null,
      now: new Date(),
    };
    const { html } = await renderLiquid(liquidMeta, context, options.dryRun);
    return html;
  }

  return legacyNotice("[QuickNoteV5]");
}

async function getItemTemplateData() {
  // If topItems are pre-defined, use it without asking
  if (addon.data.template.picker.data.topItemIds?.length > 0) {
    return addon.data.template.picker.data.topItemIds;
  }
  const librarySelectedIds = addon.data.template.picker.data
    .librarySelectedIds as number[];
  // If librarySelectedIds are pre-defined, ask user whether to use it
  if (librarySelectedIds && librarySelectedIds.length !== 0) {
    const firstSelectedItem = Zotero.Items.get(librarySelectedIds[0]);
    const data = {} as Record<string, any>;
    data;
    new ztoolkit.Dialog(1, 1)
      .setDialogData(data)
      .addCell(0, 0, {
        tag: "div",
        properties: {
          innerHTML: `${fill(
            slice(
              (firstSelectedItem.getField("title") as string) ||
                firstSelectedItem.key,
              40,
            ),
            40,
          )} ${
            librarySelectedIds.length > 1
              ? `and ${librarySelectedIds.length - 1} more`
              : ""
          } ${getString("templatePicker-itemData-info")}`,
        },
      })
      .addButton(getString("templatePicker-itemData-useLibrary"), "useLibrary")
      .addButton(getString("templatePicker-itemData-useCustom"), "useCustom")
      .open(getString("templatePicker-itemData-title"));
    await data.unloadLock.promise;
    if (data._lastButtonId === "useLibrary") {
      return librarySelectedIds;
    } else if (data._lastButtonId == "useCustom") {
      return await itemPicker();
    } else {
      return [];
    }
  }
  // No top items and no library selection (e.g. creating an item note while
  // editing a note, not in the reader): use the note's parent item as the
  // template source so [item] fields render instead of coming out blank.
  const parentItemId = addon.data.template.picker.data.parentItemId;
  if (parentItemId) {
    return [parentItemId];
  }
  return await itemPicker();
}
