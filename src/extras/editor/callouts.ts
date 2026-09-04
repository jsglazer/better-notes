import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { safeDecorations } from "./safeDecorations";

export { initCalloutPlugin, CALLOUT_TYPES };

/**
 * U22: render Obsidian-style callouts.
 *
 * Obsidian writes a callout as a block quote whose first line is `[!type]`,
 * optionally followed by a title. Zotero has no callout node — and adding one
 * is not possible, since the note schema belongs to Zotero and unknown nodes
 * are stripped on save — so a callout is stored as an ordinary block quote and
 * only *styled* here. That keeps the note portable: the marker is plain text,
 * so it survives conversion (see `restoreCalloutMarkers` in convert.ts) and
 * Obsidian renders the same callout from the same characters.
 *
 * Styling is applied with decorations, so no document transaction is generated
 * and typing a marker never rewrites the note.
 */

/** Marker word -> the CSS modifier used in editor.css. Obsidian's own set. */
const CALLOUT_TYPES: Record<string, string> = {
  note: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  info: "info",
  todo: "todo",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "failure",
  fail: "failure",
  missing: "failure",
  danger: "danger",
  error: "danger",
  bug: "bug",
  example: "example",
  quote: "quote",
  cite: "quote",
};

// `[!type]` optionally followed by `+`/`-` (Obsidian's fold hint) and a title.
const MARKER = /^\[!([A-Za-z]+)\]([+-]?)\s*(.*)$/;

function initCalloutPlugin(plugins: readonly Plugin[]) {
  console.log("Init EN Callout Plugin");
  return [
    ...plugins,
    new Plugin({
      key: new PluginKey("enhancedNotesCallouts"),
      props: {
        decorations(state) {
          return safeDecorations("callouts", () => buildDecorations(state));
        },
      },
    }),
  ];
}

function buildDecorations(state: any): DecorationSet {
  const decorations: Decoration[] = [];

  state.doc.descendants((node: any, pos: number) => {
    if (node.type.name !== "blockquote") {
      return true;
    }
    const first = node.firstChild;
    if (!first || first.type.name !== "paragraph") {
      return false;
    }
    const match = MARKER.exec(first.textContent.trim());
    if (!match) {
      return false;
    }
    const type = CALLOUT_TYPES[match[1].toLowerCase()];
    if (!type) {
      // An unknown marker is left as a plain quote rather than guessed at.
      return false;
    }
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: `enhanced-notes-callout enhanced-notes-callout-${type}`,
      }),
    );
    // The marker line is the callout's title row; tag it so the CSS can show
    // the icon and, when there is no title text, hide the raw `[!type]`.
    const titleFrom = pos + 1;
    decorations.push(
      Decoration.node(titleFrom, titleFrom + first.nodeSize, {
        class: match[3]
          ? "enhanced-notes-callout-title"
          : "enhanced-notes-callout-title enhanced-notes-callout-title-empty",
      }),
    );
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}
