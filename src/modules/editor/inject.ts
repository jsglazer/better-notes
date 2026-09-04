import { getPref } from "../../utils/prefs";
import { getFileContent } from "../../utils/str";

export async function injectEditorScripts(win: Window) {
  ztoolkit.UI.appendElement(
    {
      tag: "script",
      id: "enhanced-notes-script",
      properties: {
        innerHTML: await getFileContent(
          rootURI + "chrome/content/scripts/editorScript.js",
        ),
      },
      ignoreIfExists: true,
    },
    win.document.head,
  );
}

// U21 injected KaTeX's stylesheet here for the math preview plugin. Removed in
// U24: the note editor is `resource://zotero/note-editor/editor.html`, and
// resource: content may not link to chrome:, so the <link> was refused every
// time —
//   "Security Error: Content at resource://zotero/note-editor/editor.html may
//    not load or link to chrome://enhancednotes/content/lib/css/katex.min.css."
// It was redundant anyway: Zotero's own `note-editor/editor.css` already
// bundles the whole KaTeX stylesheet, fonts included, so the rendered formulas
// were picking up their styling from there regardless. The plugin's copy of
// katex.min.css stays for the chrome pages that legitimately load it (template
// editor, print template, link-creator preview).

export async function injectEditorCSS(win: Window) {
  const baseCSS = await getFileContent(
    rootURI + "chrome/content/styles/editor.css",
  );
  // The user's CSS goes in the SAME <style>, after the plugin's own rules, so
  // it always wins on equal specificity. It cannot be a second <style> element:
  // this one is injected with `removeIfExists`, so a re-inject (the font-size
  // observer) would move it back to the end of <head> and silently flip the
  // cascade order.
  const customCSS = getPref("editor.customCSS") as string;
  const css = customCSS?.trim()
    ? `${baseCSS}\n\n/* ---- User custom CSS (extensions.zotero.EnhancedNotes.editor.customCSS) ---- */\n${customCSS}`
    : baseCSS;
  ztoolkit.UI.appendElement(
    {
      tag: "style",
      id: "enhanced-notes-style",
      properties: {
        innerHTML: css,
      },
      removeIfExists: true,
    },
    win.document.head,
  );
}
