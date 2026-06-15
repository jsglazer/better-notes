import * as YAML from "yaml";
import { version } from "../../../../package.json";
import { showHint } from "../../../utils/hint";
import { getString } from "../../../utils/locale";
import { itemPicker } from "../../../utils/itemPicker";
import { convertLegacyTemplate } from "../legacyConvert";
import {
  refresh,
  updatePreview,
  updateTable,
  getSelectedTemplateName,
} from "./state";

export {
  createTemplate,
  importNoteTemplate,
  convertSelectedTemplate,
  saveSelectedTemplate,
  deleteSelectedTemplate,
  resetSelectedTemplate,
  shareSelectedTemplate,
  backupTemplates,
  restoreTemplates,
};

/**
 * Toolbar/command handlers for the template editor: create/import, save,
 * delete, reset-to-default, share, backup/restore, and the legacy→Liquid
 * converter. Each reads the live editor buffer + selection and routes through
 * the `addon.api.template` controller, then `refresh()`es the view.
 */

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
