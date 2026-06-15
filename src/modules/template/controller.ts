import * as YAML from "yaml";
import { createStore } from "../../utils/store";
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
  addon.data.template.data = createStore(
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
  // U4: prune obsolete templates left in prefs — the legacy JS engine is gone,
  // so a stored `[item]ItemNoteMD05` / `[ExportMDFileHeaderV2]` would only ever
  // show the "convert to Liquid" notice. Remove them outright.
  for (const obsolete of addon.api.template.OBSOLETE_TEMPLATE_NAMES) {
    if (getTemplateKeys().includes(obsolete)) {
      removeTemplate(obsolete);
    }
  }
  // Seed any missing default (incl. system) template, but DON'T overwrite one
  // the user already has. Previously system templates were reset to their
  // shipped defaults on every startup, so customizing e.g. the export filename
  // format never persisted. Seed-if-missing lets edits stick; "Reset to default"
  // in the editor (resetTemplate) is the escape hatch, and a genuinely changed
  // built-in still ships under a new `…V{n+1}` name (so it seeds fresh).
  const templateKeys = getTemplateKeys();
  for (const defaultTemplate of addon.api.template.DEFAULT_TEMPLATES) {
    if (!templateKeys.includes(defaultTemplate.name)) {
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

  let template: Record<string, any>;
  let parseError: string | undefined;
  try {
    template = YAML.parse(text);
  } catch (e) {
    try {
      template = JSON.parse(text);
    } catch (e2) {
      parseError = String(e);
      template = { name: "", content: "" };
    }
  }

  // Ensure we got a plain object with a name string
  if (
    !template ||
    typeof template !== "object" ||
    typeof template.name !== "string" ||
    !template.name
  ) {
    const msg = parseError
      ? `The template could not be parsed.\n\n${parseError}`
      : "The copied template is invalid (no name found).";
    Services.prompt.alert(null as unknown as mozIDOMWindowProxy, "Template Invalid", msg);
    return;
  }

  // Ensure content is a string — YAML may parse nested JS-like tokens as objects
  if (typeof template.content !== "string") {
    Services.prompt.alert(
      null as unknown as mozIDOMWindowProxy,
      "Template Invalid",
      `Template "${template.name}" has malformed content (expected a string).`,
    );
    return;
  }

  if (
    !options.quiet &&
    !Services.prompt.confirm(
      null as unknown as mozIDOMWindowProxy,
      "New Template from Clipboard",
      `Import template "${template.name}"?`,
    )
  ) {
    return;
  }

  try {
    setTemplate({ name: template.name, text: template.content });
  } catch (e) {
    Services.prompt.alert(
      null as unknown as mozIDOMWindowProxy,
      "Template Invalid",
      `Failed to save template "${template.name}":\n\n${String(e)}`,
    );
    return;
  }

  showHint(`Template ${template.name} saved.`);
  // Do NOT call refresh() here — it runs updatePreview() which executes the
  // template JS and can crash Zotero if the content is malformed. The editor
  // will pick up the new template the next time it is opened or refreshed.
  return template.name;
}
