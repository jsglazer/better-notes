import * as YAML from "yaml";
import { itemPicker } from "../../utils/itemPicker";
import { getString } from "../../utils/locale";
import { fill, slice } from "../../utils/str";
import { parseLiquidTemplate, renderTemplate } from "./engine";
import { buildItemModel, buildNoteModel } from "./model";
import { applyDirectives } from "./directives";

export {
  runTemplate,
  runTextTemplate,
  runItemTemplate,
  runQuickInsertTemplate,
};

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runTemplate(
  key: string,
  argString: string = "",
  argList: any[] = [],
  options: {
    useDefault?: boolean;
    dryRun?: boolean;
    stage?: string;
  } = {
    useDefault: true,
    dryRun: false,
    stage: "default",
  },
): Promise<string> {
  ztoolkit.log(`runTemplate: ${key}`);
  if (argList.length > 0) {
    argString += ", ";
  }
  argString += "_env";
  argList.push({
    dryRun: options.dryRun,
  });
  let templateText = addon.api.template.getTemplateText(key);
  if (options.useDefault && !templateText) {
    templateText =
      addon.api.template.DEFAULT_TEMPLATES.find((t) => t.name === key)?.text ||
      "";
    if (!templateText) {
      return "";
    }
  }

  if (!options.stage) {
    options.stage = "default";
  }
  let templateLines = templateText.split(/\r?\n/);
  let startIndex = templateLines.indexOf(`// @${options.stage}-begin`),
    endIndex = templateLines.indexOf(`// @${options.stage}-end`);
  if (
    startIndex < 0 &&
    endIndex < 0 &&
    typeof options.stage === "string" &&
    options.stage !== "default"
  ) {
    // Skip this stage
    return "";
  }
  if (startIndex < 0) {
    // We skip the pragma line later
    startIndex = -1;
  }
  if (endIndex < 0) {
    endIndex = templateLines.length;
  }
  // Check the markdown pragma
  templateLines = templateLines.slice(startIndex + 1, endIndex);
  let useMarkdown = false;
  const mdIndex = templateLines.findIndex((line) =>
    line.startsWith("// @use-markdown"),
  );
  if (mdIndex >= 0) {
    useMarkdown = true;
  }
  // Skip other pragmas
  templateLines = templateLines.filter((line) => !line.startsWith("// @"));
  templateText = templateLines.join("\n");

  function constructFunction(content: string) {
    return `$\{await (async () => {
        ${content}
      })()}`;
  }

  // Replace string inside ${{}}$ to async function
  templateText = templateText.replace(
    /\$\{\{([\s\S]*?)\}\}\$/g,
    (match, content) => {
      return constructFunction(content);
    },
  );

  try {
    const func = new AsyncFunction(argString, "return `" + templateText + "`");
    let res = (await func(...argList)) as string;
    if (useMarkdown) {
      res = await addon.api.convert.md2html(res);
    }
    ztoolkit.log(res);
    return res;
  } catch (e) {
    ztoolkit.log(e);
    if (options.dryRun) {
      return "Template Preview Error: " + String(e);
    }
    Zotero.getMainWindow().alert(`Template ${key} Error: ${e}`);
    return "";
  }
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

  // Route sandboxed (Liquid) [text] templates to the engine; legacy falls
  // through to the AsyncFunction path. Mirrors runItemTemplate (U4).
  const liquidMeta = parseLiquidTemplate(
    addon.api.template.getTemplateText(key),
  );
  if (liquidMeta.isLiquid) {
    return await runTextTemplateLiquid(liquidMeta, targetNoteItem, { dryRun });
  }

  const sharedObj = {};
  let renderedString = await runTemplate(
    key,
    "targetNoteItem, sharedObj",
    [targetNoteItem, sharedObj],
    {
      dryRun,
    },
  );

  const templateText = addon.api.template.getTemplateText(key);
  // Find if any line starts with // @use-refresh using regex
  if (/\/\/ @use-refresh/.test(templateText)) {
    renderedString = wrapYAMLData(renderedString, {
      template: key,
    });
  }
  return renderedString;
}

async function runItemTemplate(
  key: string,
  options: {
    itemIds?: number[];
    targetNoteId?: number;
    dryRun?: boolean;
  } = {},
): Promise<string> {
  /**
   * args:
   * beforeloop stage: items, copyNoteImage, sharedObj(for temporary variables, shared by all stages)
   * default stage: topItem, itemNotes, copyNoteImage, sharedObj
   * afterloop stage: items, copyNoteImage, sharedObj
   */
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

  // New sandboxed (Liquid) templates are routed here; legacy JS templates fall
  // through to the AsyncFunction path below. Detected by the `<!--liquid-->`
  // sentinel so the two can coexist during the migration (U4).
  const liquidMeta = parseLiquidTemplate(
    addon.api.template.getTemplateText(key),
  );
  if (liquidMeta.isLiquid) {
    return await runItemTemplateLiquid(liquidMeta, items, targetNoteItem, {
      dryRun,
    });
  }

  const copyImageRefNotes: Zotero.Item[] = [];
  const copyNoteImage = (noteItem: Zotero.Item) => {
    copyImageRefNotes.push(noteItem);
  };

  const sharedObj = {};

  const results = [];

  results.push(
    await runTemplate(
      key,
      "items, targetNoteItem, copyNoteImage, sharedObj",
      [items, targetNoteItem, copyNoteImage, sharedObj],
      {
        stage: "beforeloop",
        useDefault: false,
        dryRun,
      },
    ),
  );

  for (const topItem of items) {
    const itemNotes = topItem.isNote()
      ? []
      : Zotero.Items.get(topItem.getNotes());
    results.push(
      await runTemplate(
        key,
        "topItem, targetNoteItem, itemNotes, copyNoteImage, sharedObj",
        [topItem, targetNoteItem, itemNotes, copyNoteImage, sharedObj],
        {
          dryRun,
        },
      ),
    );
  }

  results.push(
    await runTemplate(
      key,
      "items, targetNoteItem, copyNoteImage, sharedObj",
      [items, targetNoteItem, copyNoteImage, sharedObj],
      {
        stage: "afterloop",
        useDefault: false,
        dryRun,
      },
    ),
  );

  const html = results.join("\n");
  let renderedString = await addon.api.convert.note2html(copyImageRefNotes, {
    targetNoteItem,
    html,
  });

  const templateText = addon.api.template.getTemplateText(key);
  // Find if any line starts with // @use-refresh using regex
  if (/\/\/ @use-refresh/.test(templateText)) {
    renderedString = wrapYAMLData(renderedString, {
      template: key,
      items: Array.from(items.map((item) => item.libraryKey)),
    });
  }
  return renderedString;
}

/**
 * Render an `[item]` template through the sandboxed Liquid engine (U4).
 *
 * Builds the curated `item`/`items`/`note` context (no raw Zotero API exposed to
 * the template), renders, converts Markdown → HTML when the template declared
 * `<!--markdown-->`, and applies any post-render directives (e.g. `addTags`) to
 * the target note — unless this is a dry-run preview.
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
  const context = {
    items: itemModels,
    item: itemModels[0] ?? null,
    note: noteModel,
    now: new Date(),
  };

  const rendered = await renderTemplate(meta.body, context);
  const html = meta.markdown
    ? await addon.api.convert.md2html(rendered)
    : rendered;

  if (!options.dryRun && targetNoteItem && meta.directives.addTags.length) {
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

  const rendered = await renderTemplate(meta.body, context);
  const html = meta.markdown
    ? await addon.api.convert.md2html(rendered)
    : rendered;

  if (!options.dryRun && noteItem && meta.directives.addTags.length) {
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

  const content = await runTemplate(
    "[QuickInsertV3]",
    "link, linkText, subNoteItem, noteItem, lineIndex, sectionName, selectionText",
    [
      link,
      linkText,
      noteItem,
      targetNoteItem,
      options.lineIndex,
      options.sectionName,
      options.selectionText,
    ],
    {
      dryRun: options.dryRun,
    },
  );
  return content;
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
  return await itemPicker();
}

function wrapYAMLData(str: string, data: any) {
  const yamlContent = YAML.stringify(data);
  return `<hr>
<pre>${yamlContent}</pre>${str}
<hr>`;
}
