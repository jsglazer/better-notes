import * as YAML from "yaml";
import { config, version } from "../../../package.json";
import { showHint } from "../../utils/hint";
import { itemPicker } from "../../utils/itemPicker";
import { getString } from "../../utils/locale";
import { waitUtilAsync } from "../../utils/wait";
import { xhtmlEscape } from "../../utils/str";
import { convertLegacyTemplate } from "./legacyConvert";

export async function showTemplateEditor() {
  if (
    !addon.data.template.editor.window ||
    Components.utils.isDeadWrapper(addon.data.template.editor.window) ||
    addon.data.template.editor.window.closed
  ) {
    const windowArgs = {
      _initPromise: Zotero.Promise.defer(),
    };
    const _window = Zotero.getMainWindow().openDialog(
      `chrome://${config.addonRef}/content/templateEditor.xhtml`,
      `${config.addonRef}-templateEditor`,
      `chrome,centerscreen,resizable,status,dialog=no`,
      windowArgs,
    )!;
    addon.data.template.editor.window = _window;
    await windowArgs._initPromise.promise;
    updateData();
    addon.data.template.editor.tableHelper = new ztoolkit.VirtualizedTable(
      _window!,
    )
      .setContainerId("table-container")
      .setProp({
        id: "templates-table",
        // Do not use setLocale, as it modifies the Zotero.Intl.strings
        // Set locales directly to columns
        columns: [
          {
            dataKey: "type",
            label: "templateEditor-templateType",
            width: 60,
            fixedWidth: true,
          },
          {
            dataKey: "name",
            label: "templateEditor-templateName",
            fixedWidth: false,
          },
        ].map((column) =>
          Object.assign(column, {
            label: getString(column.label),
          }),
        ),
        showHeader: true,
        multiSelect: false,
        staticColumns: true,
        disableFontSizeScaling: true,
      })
      .setProp("getRowCount", () => addon.data.template.editor.templates.length)
      .setProp("getRowData", getRowData)
      .setProp("onSelectionChange", (selection) => {
        updateEditor();
        updatePreview();
      })
      .setProp("onKeyDown", (event: KeyboardEvent) => {
        if (
          event.key == "Delete" ||
          (Zotero.isMac && event.key == "Backspace")
        ) {
          addon.api.template.removeTemplate(getSelectedTemplateName());
          refresh(true);
          return false;
        }
        return true;
      })
      .setProp(
        "getRowString",
        (index) => addon.data.template.editor.templates[index] || "",
      )
      .setProp("renderItem", (index, selection, oldElem, columns) => {
        let div;
        if (oldElem) {
          div = oldElem;
          div.innerHTML = "";
        } else {
          div = document.createElement("div");
          div.className = "row";
        }

        div.classList.toggle("selected", selection.isSelected(index));
        div.classList.toggle("focused", selection.focused == index);
        const rowData = getRowData(index);

        for (const column of columns) {
          const span = document.createElement("span");
          // @ts-ignore - className property exists on column
          span.className = `cell ${column?.className}`;
          const cellData = rowData[column.dataKey as keyof typeof rowData];
          span.textContent = cellData;
          if (column.dataKey === "type") {
            span.style.backgroundColor = getRowLabelColor(cellData);
            span.style.borderRadius = "4px";
            span.style.paddingInline = "4px";
            span.style.marginInline = "2px -2px";
            span.style.textAlign = "center";
            span.textContent = getString(
              "templateEditor-templateDisplayType",
              cellData,
            );
          }
          div.append(span);
        }
        return div;
      })
      .render();
    _window.document
      .querySelector("#templateType-help")
      ?.addEventListener("click", (ev) => {
        new addon.data.ztoolkit.Guide().highlight(_window.document, {
          title: "About Template Types",
          description: ["system", "item", "text"]
            .map(
              (type) =>
                `${getString(
                  "templateEditor-templateDisplayType",
                  type,
                )}: ${getString("templateEditor-templateHelp", type)}`,
            )
            .join("\n"),
          onNextClick: () => {
            Zotero.launchURL(
              "https://github.com/windingwind/zotero-better-notes/blob/master/docs/about-note-template.md",
            );
          },
          showButtons: ["next", "close"],
          nextBtnText: "Learn more",
          closeBtnText: "OK",
          position: "center",
        });
      });
    _window.document
      .querySelector("#create")
      ?.addEventListener("click", (ev) => {
        createTemplate();
      });
    _window.document.querySelector("#help")?.addEventListener("click", (ev) => {
      Zotero.launchURL(
        "https://github.com/windingwind/zotero-better-notes/blob/master/docs/about-note-template.md",
      );
    });
    _window.document.querySelector("#more")?.addEventListener("click", (ev) => {
      Zotero.launchURL(
        "https://github.com/windingwind/zotero-better-notes/discussions/categories/note-templates",
      );
    });
    _window.document.querySelector("#save")?.addEventListener("click", (ev) => {
      saveSelectedTemplate();
    });
    _window.document
      .querySelector("#delete")
      ?.addEventListener("click", (ev) => {
        deleteSelectedTemplate();
      });
    _window.document
      .querySelector("#reset")
      ?.addEventListener("click", (ev) => {
        resetSelectedTemplate();
      });
    _window.document
      .querySelector("#share")
      ?.addEventListener("click", (ev) => {
        shareSelectedTemplate();
      });
    _window.document
      .querySelector("#importClipboard")
      ?.addEventListener("click", (ev) => {
        addon.hooks.onImportTemplateFromClipboard();
      });
    _window.document
      .querySelector("#importNote")
      ?.addEventListener("click", (ev) => {
        importNoteTemplate();
      });
    _window.document
      .querySelector("#convertLegacy")
      ?.addEventListener("click", (ev) => {
        convertSelectedTemplate();
      });
    _window.document
      .querySelector("#backup")
      ?.addEventListener("click", (ev) => {
        backupTemplates();
      });
    _window.document
      .querySelector("#restore")
      ?.addEventListener("click", (ev) => {
        restoreTemplates(_window);
      });
    _window.document
      .querySelector("#editor-type")
      ?.addEventListener("command", (ev) => {
        updateSnippets((ev.target as XULMenuListElement)?.value);
      });
    // An ugly hack to make the editor refresh exposed
    _window.refresh = refresh;
    // Preview-only refresh for the editor's live-typing updates. The full
    // refresh() re-renders the template table and drops the selection (which
    // then hides the editor) — so the CM host must update ONLY the preview on
    // each keystroke, never the whole window.
    _window.refreshPreview = updatePreview;
    addon.data.template.editor.window?.focus();
    const editorWin = (_window.document.querySelector("#editor") as any)
      .contentWindow;
    await waitUtilAsync(() => editorWin?.loadMonaco);
    const isDark = editorWin?.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    // CodeMirror host (templateEditorCM.ts) returns a Monaco-shaped facade; it
    // highlights Liquid/Markdown itself, so there's no language to register.
    const { monaco, editor } = await editorWin.loadMonaco({
      theme: "vs-" + (isDark ? "dark" : "light"),
    });

    addon.data.template.editor.monaco = monaco;
    addon.data.template.editor.editor = editor;
    await initFormats();
  }
}

async function refresh(force = false) {
  const win = addon.data.template.editor.window;
  if (!win) {
    return;
  }
  if (!force && isTemplateNotSaved()) {
    const save = win.confirm(getString("alert-templateEditor-unsaved"));
    if (save) {
      saveSelectedTemplate();
      return;
    }
  }
  updateData();
  updateTable();
  updateEditor();
  await updatePreview();
}

function getRowData(index: number) {
  const rowData = addon.data.template.editor.templates[index];
  if (!rowData) {
    return {
      name: "",
      type: "unknown",
    };
  }
  let templateType = "unknown";
  let templateDisplayName = rowData;
  if (addon.api.template.SYSTEM_TEMPLATE_NAMES.includes(rowData)) {
    templateType = "system";
    templateDisplayName = getString(
      "templateEditor-templateDisplayName",
      // Exclude the first and last character, which are '[' and ']'
      rowData.slice(1, -1),
    );
  } else if (rowData.toLowerCase().startsWith("[item]")) {
    templateType = "item";
    templateDisplayName = rowData.slice(6);
  } else if (rowData.toLowerCase().startsWith("[text]")) {
    templateType = "text";
    templateDisplayName = rowData.slice(6);
  }
  return {
    name: templateDisplayName,
    type: templateType,
  };
}

function getRowLabelColor(type: string) {
  switch (type) {
    case "system":
      return "var(--accent-yellow)";
    case "item":
      return "var(--accent-green)";
    case "text":
      return "var(--accent-azure)";
    default:
      return "var(--accent-red)";
  }
}

function isTemplateNotSaved() {
  const name = getSelectedTemplateName();
  if (!name) {
    return false;
  }
  const text = addon.data.template.editor.editor?.getValue() as string;
  const savedText = addon.api.template.getTemplateText(name);
  if (text !== savedText) {
    return true;
  }
  const { type, name: displayName } = getRowData(getSelectedIndex());
  const templateType =
    addon.data.template.editor.window?.document.querySelector(
      "#editor-type",
    ) as XULMenuListElement;
  const templateName =
    addon.data.template.editor.window?.document.querySelector(
      "#editor-name",
    ) as HTMLInputElement;
  return type !== templateType.value || displayName !== templateName.value;
}

function updateData() {
  addon.data.template.editor.templates = addon.api.template.getTemplateKeys();
}

function updateTable(selectId?: number) {
  addon.data.template.editor.tableHelper?.render(selectId);
}

function updateEditor() {
  const name = getSelectedTemplateName();
  const { type, name: displayName } = getRowData(getSelectedIndex());
  const templateText = addon.api.template.getTemplateText(name);
  const win = addon.data.template.editor.window;
  if (!win) {
    return;
  }

  const templateType = win.document.querySelector(
    "#editor-type",
  ) as XULMenuListElement;
  const templateName = win.document.querySelector(
    "#editor-name",
  ) as HTMLInputElement;
  const editor = win?.document.getElementById("editor") as HTMLIFrameElement;
  const saveTemplate = win?.document.getElementById(
    "save",
  ) as XULButtonElement | null;
  const deleteTemplate = win?.document.getElementById(
    "delete",
  ) as XULButtonElement | null;
  const resetTemplate = win?.document.getElementById(
    "reset",
  ) as XULButtonElement | null;
  const shareTemplate = win?.document.getElementById(
    "share",
  ) as XULButtonElement | null;
  const formats = win?.document.getElementById(
    "formats-container",
  ) as HTMLDivElement;
  const snippets = win?.document.getElementById(
    "snippets-container",
  ) as HTMLDivElement;
  if (!name) {
    templateType.value = "unknown";
    templateType.setAttribute("disabled", "true");
    templateName.value = "";
    templateName.setAttribute("disabled", "true");
    editor.hidden = true;
    saveTemplate?.setAttribute("disabled", "true");
    deleteTemplate?.setAttribute("disabled", "true");
    deleteTemplate && (deleteTemplate.hidden = false);
    shareTemplate?.setAttribute("disabled", "true");
    resetTemplate && (resetTemplate.hidden = true);
    formats.hidden = true;
    snippets.hidden = true;
  } else {
    templateType.value = type;
    templateName.value = displayName;
    if (!addon.api.template.SYSTEM_TEMPLATE_NAMES.includes(name)) {
      templateType.removeAttribute("disabled");
      templateName.removeAttribute("disabled");
      deleteTemplate && (deleteTemplate.hidden = false);
      resetTemplate && (resetTemplate.hidden = true);
    } else {
      templateType.setAttribute("disabled", "true");
      templateName.setAttribute("disabled", "true");
      deleteTemplate?.setAttribute("disabled", "true");
      deleteTemplate && (deleteTemplate.hidden = true);
      resetTemplate && (resetTemplate.hidden = false);
    }
    addon.data.template.editor.editor.setValue(templateText);
    editor.hidden = false;
    saveTemplate?.removeAttribute("disabled");
    deleteTemplate?.removeAttribute("disabled");
    shareTemplate?.removeAttribute("disabled");
    formats.hidden = false;
    snippets.hidden = false;
    updateSnippets(
      (type === "system"
        ? name.slice(1, -1)
        : type) as keyof typeof snippetsStore,
    );
  }
}

async function initFormats() {
  const container =
    addon.data.template.editor.window?.document.querySelector(
      "#formats-container",
    );
  if (!container) {
    return;
  }
  container.innerHTML = "";

  // Add formats to the container, with each format as a button
  for (const format of formatStore) {
    const button = document.createElement("div");
    button.classList.add("format", format.name);
    button.style.backgroundImage = `url("chrome://${config.addonRef}/content/icons/editor/${format.name}.svg")`;
    button.dataset.l10nId = `${config.addonRef}-format-${format.name}`;
    button.addEventListener("click", () => {
      const { editor, monaco } = addon.data.template.editor;
      const selection = editor.getSelection();
      const range = new monaco.Range(
        selection.startLineNumber,
        selection.startColumn,
        selection.endLineNumber,
        selection.endColumn,
      );
      const textTemplate = format.code;
      const source =
        editor.getModel().getValueInRange(range) ||
        format.defaultText ||
        "text";
      const text = textTemplate.replace("${text}", source);
      editor.executeEdits("", [
        {
          range,
          text,
          forceMoveMarkers: true,
        },
      ]);
      // Keep the selection after inserting the format
      const textBeforeReplace = textTemplate.split("${text}")[0];
      const textBeforeLines = textBeforeReplace.split("\n");
      const textLines = source.split("\n");

      // Calculate the new range
      const startLineNumber =
        selection.startLineNumber + textBeforeLines.length - 1;
      const startColumn =
        textBeforeLines.length === 1
          ? selection.startColumn + textBeforeReplace.length
          : textBeforeLines.slice(-1)[0].length + 1;
      const endLineNumber = startLineNumber + textLines.length - 1;
      const endColumn =
        textLines.length === 1
          ? startColumn + source.length
          : textLines.slice(-1)[0].length + 1;

      const newRange = new monaco.Range(
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn,
      );

      editor.setSelection(newRange);

      // Ensure the Liquid markdown sentinel is present so the inserted format
      // (Markdown) is converted on render. (Was the removed JS engine's
      // `// @use-markdown`.)
      if (
        !editor
          .getModel()
          .getLinesContent()
          .some((line: any) => line.trim().startsWith("<!--markdown-->"))
      ) {
        editor.executeEdits("", [
          {
            range: new monaco.Range(1, 1, 1, 1),
            text: "<!--markdown-->\n",
            forceMoveMarkers: true,
          },
        ]);
      }
    });
    container.appendChild(button);
  }
}

async function updateSnippets(type: string) {
  const container = addon.data.template.editor.window?.document.querySelector(
    "#snippets-container",
  );
  if (!container) {
    return;
  }
  container.innerHTML = "";

  const snippets = (
    snippetsStore[type as keyof typeof snippetsStore] || []
  ).concat(snippetsStore.global);
  if (!snippets) {
    return;
  }

  // Add snippets to the container, with each snippet as a button
  // Dragging the button to the editor will insert the snippet
  for (const snippet of snippets) {
    const button = document.createElement("span");
    button.classList.add("snippet", snippet.type);
    // Liquid snippets carry their own label + show the inserted code as tooltip
    // (decoupled from the locale files, which still describe the removed engine).
    button.textContent = snippet.label;
    button.title = snippet.code.trim();
    button.addEventListener("click", () => {
      const { editor, monaco } = addon.data.template.editor;
      const selection = editor.getSelection();
      const range = new monaco.Range(
        selection.startLineNumber,
        selection.startColumn,
        selection.endLineNumber,
        selection.endColumn,
      );
      const text = snippet.code;
      editor.executeEdits("", [
        {
          range,
          text,
          forceMoveMarkers: true,
        },
      ]);
      // Select the inserted text, should compute the new range, as the text can be multi-line
      const newRange = new monaco.Range(
        selection.startLineNumber,
        selection.startColumn,
        selection.startLineNumber + text.split("\n").length - 1,
        text.split("\n").slice(-1)[0].length + 1,
      );
      editor.setSelection(newRange);
    });
    container.appendChild(button);
  }
}

async function updatePreview() {
  const name = getSelectedTemplateName();
  const html = xhtmlEscape(
    await addon.api.template.renderTemplatePreview(name),
  );

  const win = addon.data.template.editor.window;
  const container = win?.document.getElementById("preview-container");
  if (container) {
    container.innerHTML = html;
  }
}

function getSelectedTemplateName() {
  const selectedTemplate =
    addon.data.template.editor.templates[getSelectedIndex()];
  return selectedTemplate || "";
}

function getSelectedIndex() {
  const selectedIndex =
    addon.data.template.editor.tableHelper?.treeInstance.selection.selected
      .values()
      .next().value;
  return selectedIndex as number;
}

function createTemplate() {
  const template: NoteTemplate = {
    name: `New Template: ${new Date().getTime()}`,
    text: "",
  };
  addon.api.template.setTemplate(template);
  refresh();
}

async function importNoteTemplate() {
  const ids = await itemPicker();
  const note: Zotero.Item = Zotero.Items.get(ids).filter((item: Zotero.Item) =>
    item.isNote(),
  )[0];
  if (!note) {
    return;
  }
  const template: NoteTemplate = {
    name: `Template from ${note.getNoteTitle()}: ${new Date().getTime()}`,
    text: addon.api.sync.getNoteStatus(note.id)?.content || "",
  };
  addon.api.template.setTemplate(template);
  refresh();
}

/**
 * Convert the template currently open in the editor from the removed legacy
 * JavaScript engine to Liquid (U6). Operates on the live editor buffer (not the
 * saved copy), so the user can review the result and Save — or close without
 * saving to discard. Un-mappable expressions are flagged inline with
 * `{% comment %} BN-MIGRATE … {% endcomment %}`; a summary is shown afterwards.
 */
function convertSelectedTemplate() {
  const win = addon.data.template.editor.window;
  if (!win) {
    return;
  }
  const name = getSelectedTemplateName();
  if (!name) {
    showHint("Select a template to convert first.");
    return;
  }
  const editor = addon.data.template.editor.editor;
  const source = (editor?.getValue() as string) || "";
  const type = (
    win.document.querySelector("#editor-type") as XULMenuListElement
  )?.value as "item" | "text" | "unknown";

  const result = convertLegacyTemplate(source, type || "item");
  if (result.alreadyLiquid) {
    showHint("This template is already Liquid — nothing to convert.");
    return;
  }

  const summary =
    `Convert "${name}" to Liquid?\n\n` +
    `• ${result.mapped} expression(s) auto-converted\n` +
    `• ${result.manual} expression(s) flagged for manual edit\n\n` +
    result.notes.map((n) => `– ${n}`).join("\n\n") +
    `\n\nThe editor buffer will be replaced. Review it, then Save to keep ` +
    `the change (or close without saving to discard).`;
  if (!win.confirm(summary)) {
    return;
  }

  editor.setValue(result.liquid);
  updatePreview();
  showHint(
    result.manual > 0
      ? `Converted. ${result.manual} item(s) need manual edits — search for "BN-MIGRATE".`
      : "Converted to Liquid. Review and Save.",
  );
}

function saveSelectedTemplate() {
  const win = addon.data.template.editor.window;
  if (!win) {
    return;
  }

  const templateType = win.document.querySelector(
    "#editor-type",
  ) as XULMenuListElement;
  const templateName = win.document.querySelector(
    "#editor-name",
  ) as HTMLInputElement;

  const name = getSelectedTemplateName();
  const type = templateType.value;
  let modifiedName: string;
  if (type === "system") {
    modifiedName = name;
  } else if (type === "unknown") {
    modifiedName = templateName.value;
  } else {
    modifiedName = `[${type}]${templateName.value}`;
  }

  if (
    addon.api.template.SYSTEM_TEMPLATE_NAMES.includes(name) &&
    modifiedName !== name
  ) {
    showHint(
      `Template ${name} is a system template. Modifying template name is not allowed.`,
    );
    return;
  }

  const template = {
    name: modifiedName,
    text: addon.data.template.editor.editor.getValue() as string,
  };
  if (
    template.text.includes(
      "# This template is specifically for importing/sharing",
    )
  ) {
    const useImport = addon.data.template.editor.window?.confirm(
      getString("alert-templateEditor-shouldImport"),
    );
    if (useImport) {
      addon.hooks.onImportTemplateFromClipboard(template.text);
      refresh(true);
      return;
    }
  }

  addon.api.template.setTemplate(template);
  if (name !== modifiedName) {
    addon.api.template.removeTemplate(name);
  }
  showHint(`Template ${modifiedName} saved.`);
  const selectedId =
    addon.data.template.editor.tableHelper?.treeInstance.selection.selected
      .values()
      .next().value;
  refresh(true).then(() => updateTable(selectedId));
}

function deleteSelectedTemplate() {
  const name = getSelectedTemplateName();
  if (addon.api.template.SYSTEM_TEMPLATE_NAMES.includes(name)) {
    showHint(
      `Template ${name} is a system template. Removing system template is note allowed.`,
    );
    return;
  }
  addon.api.template.removeTemplate(name);
  refresh(true);
}

function resetSelectedTemplate() {
  const name = getSelectedTemplateName();
  // Any template that ships a built-in default can be reset to it — not just
  // system templates. System templates are no longer force-reset on startup
  // (so edits persist), making this the way to restore the shipped version;
  // the `[item]ItemNoteMD-Liquid` starter is resettable the same way.
  const def = addon.api.template.DEFAULT_TEMPLATES.find((t) => t.name === name);
  if (def) {
    addon.data.template.editor.editor.setValue(def.text || "");
    showHint(`Template ${name} is reset. Please save before leaving.`);
  }
}

function shareSelectedTemplate() {
  const name = getSelectedTemplateName();
  if (!name) {
    return;
  }
  saveSelectedTemplate();
  const content = addon.api.template.getTemplateText(name);
  const yaml = `# This template is specifically for importing/sharing, using better 
# notes 'import from clipboard': copy the content and
# goto Zotero menu bar, click Tools->New Template from Clipboard.  
# Do not copy-paste this to better notes template editor directly.
name: "${name}"
zoteroVersion: "${Zotero.version}"
pluginVersion: "${version}"
savedAt: "${new Date().toISOString()}"
content: |-
${content
  .split("\n")
  .map((line) => `  ${line}`)
  .join("\n")}
`;
  new ztoolkit.Clipboard().addText(yaml, "text/plain").copy();
  showHint(
    `Template ${name} is copied to clipboard. To import it, goto Zotero menu->Tools->New Template from Clipboard.  `,
  );
}

async function backupTemplates() {
  const time = new Date().toISOString().replace(/:/g, "-");
  const filepath = await new ztoolkit.FilePicker(
    "Save backup file",
    "save",
    [["yaml", "*.yaml"]],
    `bn-template-backup-${time}.yaml`,
  ).open();
  if (!filepath) {
    return;
  }
  const keys = addon.api.template.getTemplateKeys();
  const templates = keys.map((key) => {
    return {
      name: key,
      text: addon.api.template.getTemplateText(key),
    };
  });
  const yaml = YAML.stringify(templates);
  await Zotero.File.putContentsAsync(filepath, yaml);
}

async function restoreTemplates(win: Window) {
  const filepath = await new ztoolkit.FilePicker(
    "Open backup file",
    "open",
    [["yaml", "*.yaml"]],
    undefined,
    win,
    "text",
  ).open();
  if (!filepath) {
    return;
  }
  const yaml = (await Zotero.File.getContentsAsync(filepath)) as string;
  const templates = YAML.parse(yaml) as NoteTemplate[];
  const existingNames = addon.api.template.getTemplateKeys();

  for (const t of templates) {
    if (existingNames.includes(t.name)) {
      const overwrite = win.confirm(
        `Template ${t.name} already exists. Overwrite?`,
      );
      if (!overwrite) {
        continue;
      }
    }
    addon.api.template.setTemplate(t);
  }
  await refresh(true);
}

const formatStore = [
  {
    name: "bold",
    code: "**${text}**",
  },
  {
    name: "italic",
    code: "_${text}_",
  },
  {
    name: "strikethrough",
    code: "~~${text}~~",
  },
  {
    name: "underline",
    code: "<u>${text}</u>",
  },
  {
    name: "superscript",
    code: "<sup>${text}</sup>",
  },
  { name: "subscript", code: "<sub>${text}</sub>" },
  {
    name: "textColor",
    code: '<span style="color: orange">${text}</span>',
  },
  {
    name: "link",
    code: "[${text}](url)",
  },
  {
    name: "quote",
    code: "\n> ${text}",
  },
  {
    name: "monospaced",
    code: "<code>${text}</code>",
  },
  {
    name: "code",
    code: "\n<pre>\n${text}\n</pre>\n",
  },
  {
    name: "table",
    code: "\n| ${text} | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |\n",
  },
  {
    name: "h1",
    code: "\n# ${text}",
  },
  {
    name: "h2",
    code: "\n## ${text}",
  },
  {
    name: "h3",
    code: "\n### ${text}",
  },
  {
    name: "bullet",
    code: "\n- ${text}",
  },
  {
    name: "numbered",
    code: "\n1. ${text}",
  },
  {
    name: "inlineMath",
    code: "$${text}$",
    defaultText: "e=mc^2",
  },
  {
    name: "blockMath",
    code: "\n$$\n${text}\n$$\n",
    defaultText: "e=mc^2",
  },
  // The Markdown-formatting toolbar holds only Markdown/HTML formatting. Liquid
  // constructs (`{{ … }}`, `{% if %}`/`{% for %}`, etc.) are inserted from the
  // snippets palette (`snippetsStore`) — the legacy `inlineScript`/`blockScript`
  // buttons here were residue of the removed JS engine and duplicated it.
];

// Insertable snippets for the template editor, keyed by the editor's template
// type. Only `global`, `item`, and `text` are reachable (the editor-type
// selector yields unknown/system/item/text). All snippets emit valid Liquid;
// each carries its own display `label` (the locale files still describe the
// removed JS engine, so the renderer uses `label` + a code tooltip instead).
const snippetsStore: Record<
  string,
  { name: string; label: string; code: string; type: string }[]
> = {
  global: [
    { name: "liquidHeader", label: "liquid header", code: "<!--liquid-->\n", type: "syntax" },
    { name: "markdownHeader", label: "markdown", code: "<!--markdown-->\n", type: "syntax" },
    { name: "addTags", label: "add tags", code: "<!--addTags: -->\n", type: "syntax" },
    { name: "ifBlock", label: "if", code: "{% if condition %}\n\n{% endif %}\n", type: "syntax" },
    { name: "forBlock", label: "for", code: "{% for x in items %}\n\n{% endfor %}\n", type: "syntax" },
    { name: "comment", label: "comment", code: "{% comment %}\n\n{% endcomment %}\n", type: "syntax" },
  ],
  item: [
    { name: "itemTitle", label: "title", code: "{{ item.title }}", type: "variable" },
    { name: "itemCiteKey", label: "citation key", code: "{{ item.citekey }}", type: "variable" },
    { name: "itemAuthors", label: "authors", code: "{% for a in item.authors %}{{ a.name }}{% unless forloop.last %}; {% endunless %}{% endfor %}", type: "expression" },
    { name: "itemFirstAuthor", label: "first author", code: "{{ item.authors[0].name }}", type: "variable" },
    { name: "itemDate", label: "date", code: "{{ item.date }}", type: "variable" },
    { name: "itemYear", label: "year", code: "{{ item.year }}", type: "variable" },
    { name: "itemAbstract", label: "abstract", code: "{{ item.abstract }}", type: "variable" },
    { name: "itemAbstractOneline", label: "abstract (1 line)", code: "{{ item.abstract | oneline }}", type: "expression" },
    { name: "itemDOI", label: "DOI", code: "{{ item.doi }}", type: "variable" },
    { name: "itemURL", label: "URL", code: "{{ item.url }}", type: "variable" },
    { name: "itemType", label: "item type", code: "{{ item.itemType }}", type: "variable" },
    { name: "itemTags", label: "tags", code: "{% for t in item.tags %}{{ t }}{% unless forloop.last %}, {% endunless %}{% endfor %}", type: "expression" },
    { name: "itemCollections", label: "collections", code: "{% for c in item.collections %}{{ c }}{% endfor %}", type: "expression" },
    { name: "itemKey", label: "item key", code: "{{ item.key }}", type: "variable" },
    { name: "itemAnnotations", label: "annotations", code: "{% annotations %}", type: "syntax" },
    { name: "itemAnnotationsGrouped", label: "annotations (grouped)", code: "{% annotations grouped %}", type: "syntax" },
    { name: "itemNoteTitle", label: "note title", code: "{{ note.title }}", type: "variable" },
  ],
  text: [
    { name: "textNoteTitle", label: "note title", code: "{{ note.title }}", type: "variable" },
    { name: "textNoteCiteKey", label: "note citation key", code: "{{ note.citekey }}", type: "variable" },
    { name: "textNoteParentTitle", label: "parent title", code: "{{ note.parentTitle }}", type: "variable" },
    { name: "textNoteTags", label: "note tags", code: "{% for t in note.tags %}{{ t }}{% endfor %}", type: "expression" },
    { name: "textNow", label: "current date", code: '{{ now | date: "%Y-%m-%d" }}', type: "expression" },
  ],
};
