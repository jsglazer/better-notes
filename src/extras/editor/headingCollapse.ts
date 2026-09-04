import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet, EditorView } from "prosemirror-view";
import { safeDecorations } from "./safeDecorations";

export { initHeadingCollapsePlugin };

/**
 * U22: fold a heading's section in the editor.
 *
 * A heading owns everything up to the next heading of the same or higher level
 * (the same rule the outline pane uses). Collapsing hides those nodes with a
 * decoration class and puts a twisty in the heading's margin.
 *
 * The collapsed set is plugin state, not document state: folding must never
 * touch the note, or it would dirty the item, trigger a sync, and travel to
 * other machines as a content change. The consequence is that folds are
 * per-editor and reset when the note is reopened, which is the right trade —
 * a view preference should not rewrite the document.
 */

const key = new PluginKey<CollapseState>("enhancedNotesHeadingCollapse");

interface CollapseState {
  // Positions of the collapsed headings, remapped across every transaction.
  collapsed: number[];
}

function initHeadingCollapsePlugin(plugins: readonly Plugin[]) {
  console.log("Init EN Heading Collapse Plugin");
  return [
    ...plugins,
    new Plugin<CollapseState>({
      key,
      state: {
        init: () => ({ collapsed: [] }),
        apply(tr, value) {
          const toggle = tr.getMeta(key) as { pos: number } | undefined;
          // Remap first: the stored positions refer to the document *before*
          // this transaction, so an edit above a fold would otherwise shift the
          // fold onto the wrong heading.
          let collapsed = value.collapsed
            .map((pos) => {
              const mapped = tr.mapping.mapResult(pos);
              return mapped.deleted ? -1 : mapped.pos;
            })
            .filter((pos) => pos >= 0);
          if (toggle) {
            collapsed = collapsed.includes(toggle.pos)
              ? collapsed.filter((pos) => pos !== toggle.pos)
              : [...collapsed, toggle.pos];
          }
          return { collapsed };
        },
      },
      props: {
        decorations(state) {
          return safeDecorations("headingCollapse", () => buildDecorations(state));
        },
      },
    }),
  ];
}

/** Toggle the fold for the heading at `pos`, via a metadata-only transaction. */
function toggleAt(view: EditorView, pos: number) {
  view.dispatch(view.state.tr.setMeta(key, { pos }).setMeta("addToHistory", false));
}

function buildDecorations(state: any): DecorationSet {
  const pluginState = key.getState(state) as CollapseState | undefined;
  const collapsed = pluginState?.collapsed ?? [];
  const decorations: Decoration[] = [];

  // Every top-level heading, with the position where its section ends.
  const headings: { pos: number; level: number; end: number }[] = [];
  state.doc.forEach((node: any, offset: number) => {
    if (node.type.name === "heading") {
      headings.push({
        pos: offset,
        level: node.attrs.level,
        end: state.doc.content.size,
      });
    }
  });
  for (let i = 0; i < headings.length; i++) {
    const next = headings.find(
      (h, j) => j > i && h.level <= headings[i].level,
    );
    if (next) {
      headings[i].end = next.pos;
    }
  }

  for (const heading of headings) {
    const isCollapsed = collapsed.includes(heading.pos);
    const node = state.doc.nodeAt(heading.pos);
    if (!node) {
      continue;
    }
    const sectionStart = heading.pos + node.nodeSize;
    const hasContent = sectionStart < heading.end;

    decorations.push(
      Decoration.node(heading.pos, heading.pos + node.nodeSize, {
        class: [
          "enhanced-notes-heading",
          hasContent ? "enhanced-notes-heading-foldable" : "",
          isCollapsed ? "enhanced-notes-heading-collapsed" : "",
        ]
          .filter(Boolean)
          .join(" "),
      }),
    );

    // The twisty. A widget rather than a ::before, so it can take a click
    // without stealing the caret from the heading text.
    if (hasContent) {
      decorations.push(
        Decoration.widget(
          heading.pos + 1,
          (view: EditorView) => {
            const dom = view.dom.ownerDocument.createElement("span");
            dom.className = "enhanced-notes-fold-toggle";
            dom.setAttribute("contenteditable", "false");
            dom.title = isCollapsed ? "Expand section" : "Collapse section";
            dom.textContent = isCollapsed ? "▶" : "▼";
            dom.addEventListener("mousedown", (event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleAt(view, heading.pos);
            });
            return dom;
          },
          { side: -1, ignoreSelection: true },
        ),
      );
    }

    if (isCollapsed && hasContent) {
      // Hide each node of the section individually: a single decoration
      // spanning the range would also swallow the heading's own line box.
      state.doc.nodesBetween(
        sectionStart,
        heading.end,
        (child: any, childPos: number) => {
          if (childPos < sectionStart || childPos >= heading.end) {
            return false;
          }
          decorations.push(
            Decoration.node(childPos, childPos + child.nodeSize, {
              class: "enhanced-notes-section-hidden",
            }),
          );
          return false;
        },
      );
    }
  }

  return DecorationSet.create(state.doc, decorations);
}
