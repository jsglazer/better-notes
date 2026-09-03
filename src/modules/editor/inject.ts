import { config } from "../../../package.json";
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
  ztoolkit.UI.appendElement(
    {
      tag: "style",
      id: "enhanced-notes-style",
      properties: {
        innerHTML: await getFileContent(
          rootURI + "chrome/content/styles/editor.css",
        ),
      },
      removeIfExists: true,
    },
    win.document.head,
  );
}
