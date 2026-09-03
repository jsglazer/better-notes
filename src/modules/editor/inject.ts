import { config } from "../../../package.json";
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

/**
 * U21: KaTeX's own stylesheet, needed by the math preview plugin.
 *
 * Linked rather than inlined on purpose: katex.min.css refers to its fonts with
 * relative URLs (`fonts/KaTeX_Main-Regular.woff2`), which only resolve if the
 * browser knows the stylesheet's own location. Inlining the text into a <style>
 * would resolve them against the editor document instead and every glyph would
 * fall back to a serif face.
 */
export function injectEditorKatexCSS(win: Window) {
  ztoolkit.UI.appendElement(
    {
      tag: "link",
      id: "enhanced-notes-katex-style",
      properties: {
        rel: "stylesheet",
        type: "text/css",
        href: `chrome://${config.addonRef}/content/lib/css/katex.min.css`,
      },
      ignoreIfExists: true,
    },
    win.document.head,
  );
}

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
