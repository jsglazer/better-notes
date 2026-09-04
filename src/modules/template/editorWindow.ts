import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { waitUtilAsync } from "../../utils/wait";
import { initFormats, updateSnippets } from "./editor/toolbar";
import {
  refresh,
  updateData,
  updateEditor,
  updatePreview,
  getRowData,
  getRowLabelColor,
  getSelectedTemplateName,
} from "./editor/state";
import {
  createTemplate,
  importNoteTemplate,
  convertSelectedTemplate,
  saveSelectedTemplate,
  deleteSelectedTemplate,
  duplicateSelectedTemplate,
  resetSelectedTemplate,
  shareSelectedTemplate,
  backupTemplates,
  restoreTemplates,
} from "./editor/actions";

/**
 * The template editor window bootstrap: opens the dialog, builds the template
 * list (VirtualizedTable), wires the toolbar buttons, and loads the embedded
 * code editor. The editor's behavior is split across siblings:
 * - `editor/state.ts` — selection + view sync (`refresh`, `update*`)
 * - `editor/toolbar.ts` — the formats + snippets insert palettes
 * - `editor/actions.ts` — toolbar/command handlers (save, delete, share, …)
 */
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
              "https://github.com/jsglazer/enhanced-notes/blob/main/docs/about-note-template.md",
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
        "https://github.com/jsglazer/enhanced-notes/blob/main/docs/about-note-template.md",
      );
    });
    _window.document.querySelector("#more")?.addEventListener("click", (ev) => {
      Zotero.launchURL(
        "https://github.com/jsglazer/enhanced-notes/blob/main/docs/liquid-templates.md",
      );
    });
    _window.document.querySelector("#save")?.addEventListener("click", (ev) => {
      saveSelectedTemplate();
    });
    _window.document
      .querySelector("#duplicate")
      ?.addEventListener("click", (ev) => {
        duplicateSelectedTemplate();
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
