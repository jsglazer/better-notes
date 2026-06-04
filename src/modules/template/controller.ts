import YAML = require("yamljs");
import { getPref } from "../../utils/prefs";
import { showHint } from "../../utils/hint";
import { config } from "../../../package.json";

export {
  getTemplateKeys,
  getTemplateText,
  setTemplate,
  removeTemplate,
  initTemplates,
  importTemplateFromClipboard,
};

function initTemplates() {
  addon.data.template.data = new ztoolkit.LargePref(
    `${config.prefsPrefix}.templateKeys`,
    `${config.prefsPrefix}.template.`,
    "parser",
  );
  // Convert old template keys to new format
  const raw = getPref("templateKeys") as string;
  let keys = raw ? JSON.parse(raw) : [];
  if (keys.length > 0) {
    keys = keys.map((t: { name: string } | string) => {
      if (typeof t === "string") {
        return t;
      }
      return t.name;
    });
    setTemplateKeys(Array.from(new Set(keys)));
  }
  // Add default templates; always reset system templates to their shipped defaults
  const templateKeys = getTemplateKeys();
  for (const defaultTemplate of addon.api.template.DEFAULT_TEMPLATES) {
    const isSystem = (
      addon.api.template.SYSTEM_TEMPLATE_NAMES as string[]
    ).includes(defaultTemplate.name);
    if (!templateKeys.includes(defaultTemplate.name) || isSystem) {
      setTemplate(defaultTemplate);
    }
  }
}

function getTemplateKeys(): string[] {
  return addon.data.template.data?.getKeys() || [];
}

function setTemplateKeys(templateKeys: string[]): void {
  addon.data.template.data?.setKeys(templateKeys);
}

function getTemplateText(keyName: string): string {
  return addon.data.template.data?.getValue(keyName) || "";
}

function setTemplate(template: NoteTemplate): void {
  addon.data.template.data?.setValue(template.name, template.text);
}

function removeTemplate(keyName: string | undefined): void {
  if (!keyName) {
    return;
  }
  addon.data.template.data?.deleteKey(keyName);
}

function importTemplateFromClipboard(
  text?: string,
  options: {
    quiet?: boolean;
  } = {},
) {
  if (!text) {
    text = Zotero.Utilities.Internal.getClipboard("text/plain") || "";
  }
  if (!text) {
    return;
  }
  let template: Record<string, string>;
  let parseError: string | undefined;
  try {
    template = YAML.parse(text);
  } catch (e) {
    try {
      template = JSON.parse(text);
    } catch (e2) {
      parseError = String(e);
      template = { name: "", text: "" };
    }
  }
  if (!template || !template.name) {
    const msg = parseError
      ? `Template Invalid\n\n${parseError}`
      : "The copied template is invalid.";
    Services.prompt.alert(window as any, "Template Invalid", msg);
    return;
  }
  if (
    !options.quiet &&
    !Services.prompt.confirm(
      window as any,
      "New Template from Clipboard",
      `Import template "${template.name}"?`,
    )
  ) {
    return;
  }
  try {
    setTemplate({ name: template.name, text: template.content });
    showHint(`Template ${template.name} saved.`);
    if (addon.data.template.editor.window) {
      addon.data.template.editor.window.refresh();
    }
  } catch (e) {
    Services.prompt.alert(
      window as any,
      "Template Invalid",
      `Failed to import template "${template.name}":\n\n${String(e)}`,
    );
    return;
  }
  return template.name;
}
