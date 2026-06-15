import { getString } from "../../../utils/locale";
import { xhtmlEscape } from "../../../utils/str";
import { updateSnippets } from "./toolbar";
import { saveSelectedTemplate } from "./actions";

export {
  refresh,
  updateData,
  updateTable,
  updateEditor,
  updatePreview,
  isTemplateNotSaved,
  getRowData,
  getRowLabelColor,
  getSelectedTemplateName,
  getSelectedIndex,
};

/**
 * Editor state + view synchronization for the template editor window.
 *
 * `refresh()` is the hub: re-read the template list, re-render the table, and
 * resync the editor + preview to the current selection. The `update*` helpers
 * are the individual sync steps; the `getSelected*`/`getRow*` helpers read the
 * current selection. All operate on `addon.data.template.editor`.
 *
 * (`refresh` ↔ `actions.saveSelectedTemplate` is an intentional module cycle —
 * an unsaved-changes prompt may save before refreshing. Both are functions
 * invoked at runtime, never at module load, so the cycle is safe.)
 */

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
    updateSnippets(type === "system" ? name.slice(1, -1) : type);
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
