import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import * as katex from "katex";

export { initMathPreviewPlugin };

/**
 * U21: render formulas in the live editor.
 *
 * Zotero stores math as `math_inline` / `math_display` nodes whose text is the
 * raw TeX, and its editor shows that source as-is — so a formula reads as
 * `$\int_0^1 x^2 dx$` while you are looking at the note. KaTeX was only ever
 * applied on export/preview (`src/utils/note.ts`).
 *
 * This plugin renders each formula with KaTeX as a widget decoration and hides
 * the source underneath it, *except* for the formula the cursor is currently
 * in — that one stays as editable TeX, so editing still works normally and no
 * document transaction is ever generated (decorations are view-only, so notes
 * are not rewritten and sync is not triggered).
 */

const MATH_NODES = ["math_inline", "math_display"];

function initMathPreviewPlugin(plugins: readonly Plugin[]) {
  console.log("Init EN Math Preview Plugin");
  return [
    ...plugins,
    new Plugin({
      key: new PluginKey("enhancedNotesMathPreview"),
      props: {
        decorations(state) {
          return buildDecorations(state);
        },
      },
    }),
  ];
}

function buildDecorations(state: any): DecorationSet {
  const decorations: Decoration[] = [];
  const { from: selFrom, to: selTo } = state.selection;

  state.doc.descendants((node: any, pos: number) => {
    if (!MATH_NODES.includes(node.type.name)) {
      // Math nodes are leaves; keep walking anything that could contain one.
      return true;
    }
    const end = pos + node.nodeSize;
    // The formula being edited stays as source, so typing is unaffected.
    if (selTo >= pos && selFrom <= end) {
      return false;
    }
    const tex = node.textContent;
    if (!tex.trim()) {
      return false;
    }
    const displayMode = node.type.name === "math_display";
    let html: string;
    try {
      html = katex.renderToString(tex, { throwOnError: false, displayMode });
    } catch (e) {
      // Never let an unparseable formula break the editor — leave the source.
      return false;
    }
    decorations.push(
      Decoration.widget(
        pos,
        (view: EditorView) => renderWidget(view, html, displayMode, pos),
        // side: 1 keeps the widget after the hidden source, so a cursor placed
        // at the node's start still belongs to the node rather than the widget.
        { side: 1 },
      ),
    );
    decorations.push(
      Decoration.node(pos, end, { class: "enhanced-notes-math-rendered" }),
    );
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

function renderWidget(
  view: EditorView,
  html: string,
  displayMode: boolean,
  pos: number,
) {
  const doc = view.dom.ownerDocument;
  const dom = doc.createElement(displayMode ? "div" : "span");
  dom.className = displayMode
    ? "enhanced-notes-math-preview enhanced-notes-math-preview-display"
    : "enhanced-notes-math-preview";
  dom.setAttribute("contenteditable", "false");
  dom.innerHTML = html;
  // Clicking the rendered formula puts the cursor into its source, which is
  // what reveals the TeX again (the decoration drops out for that node).
  dom.addEventListener("mousedown", (event) => {
    event.preventDefault();
    const { state, dispatch } = view;
    const TextSelectionCtor = state.selection
      .constructor as unknown as { near(pos: any): any };
    try {
      dispatch(
        state.tr.setSelection(TextSelectionCtor.near(state.doc.resolve(pos + 1))),
      );
      view.focus();
    } catch (e) {
      console.warn("EN: Failed to focus math source", e);
    }
  });
  return dom;
}
