/**
 * Self-contained CodeMirror 6 host for the template editor.
 *
 * Replaces the previous editor, which loaded Monaco from the Zotero **Scaffold**
 * developer plugin (`chrome://scaffold/content/monaco/monaco.html`) and
 * configured it (~2,270 lines, deleted) for the now-removed JavaScript template
 * engine. That made the editor depend on a dev-only plugin and highlight the
 * wrong language. CodeMirror is bundled into the plugin (no external/Scaffold
 * dependency) and highlights Liquid + Markdown — what templates actually are.
 *
 * Loaded inside the editor iframe (`templateEditorCM.html`). It defines
 * `window.loadMonaco()` — the same name/shape the host window already calls — so
 * the host (`editorWindow.ts`) is almost unchanged: it gets back a small
 * `{ monaco, editor }` facade mimicking just the Monaco surface that code uses
 * (getValue/setValue/getSelection/setSelection/executeEdits/getModel/focus and a
 * `Range` constructor). Line/column here are 1-based, matching Monaco.
 */

import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  Decoration,
  DecorationSet,
  ViewPlugin,
  ViewUpdate,
  MatchDecorator,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from "@codemirror/language";
import {
  autocompletion,
  completionKeymap,
  CompletionContext,
  Completion,
  CompletionResult,
} from "@codemirror/autocomplete";
import { computeCompletion } from "../modules/template/completions";

interface MonacoRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/** 1-based (line, column) → absolute document offset, clamped to the line. */
function posToOffset(
  state: EditorState,
  line: number,
  column: number,
): number {
  const lineNo = Math.min(Math.max(line, 1), state.doc.lines);
  const l = state.doc.line(lineNo);
  return Math.min(l.from + Math.max(column - 1, 0), l.to);
}

/** Absolute offset → 1-based (line, column). */
function offsetToPos(
  state: EditorState,
  offset: number,
): { lineNumber: number; column: number } {
  const line = state.doc.lineAt(Math.min(Math.max(offset, 0), state.doc.length));
  return { lineNumber: line.number, column: offset - line.from + 1 };
}

// Highlight Liquid output `{{ … }}`, tags `{% … %}`, and `<!-- … -->` sentinels.
const liquidMatcher = new MatchDecorator({
  regexp: /(\{\{-?[\s\S]*?-?\}\})|(\{%-?[\s\S]*?-?%\})|(<!--[\s\S]*?-->)/g,
  decoration: (m) =>
    m[1]
      ? Decoration.mark({ class: "bn-liquid-output" })
      : m[2]
        ? Decoration.mark({ class: "bn-liquid-tag" })
        : Decoration.mark({ class: "bn-liquid-comment" }),
});

const liquidHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = liquidMatcher.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = liquidMatcher.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

// Maps the pure catalog's `kind` to a CodeMirror completion `type` (icon).
const KIND_TO_TYPE: Record<string, string> = {
  variable: "variable",
  field: "property",
  filter: "function",
  tag: "keyword",
};

/**
 * CodeMirror completion source — a thin adapter over the pure
 * `computeCompletion` (completions.ts). All the "what can I type here" logic
 * lives in that unit-tested module; here we just translate doc/cursor → entries
 * and entries → CM `Completion`s. Returns null outside `{{ … }}` / `{% … %}` so
 * the popup never fires while writing plain Markdown/HTML.
 */
function liquidCompletionSource(ctx: CompletionContext): CompletionResult | null {
  const res = computeCompletion(ctx.state.doc.toString(), ctx.pos);
  if (!res || res.options.length === 0) {
    return null;
  }
  const options: Completion[] = res.options.map((e) => ({
    label: e.label,
    detail: e.detail,
    info: e.info,
    type: KIND_TO_TYPE[e.kind] ?? "text",
  }));
  return {
    from: res.from,
    options,
    // Keep the list open + filtering while the user keeps typing identifier
    // characters; reopen (re-query context) otherwise.
    validFor: /^[\w]*$/,
  };
}

function buildTheme(isDark: boolean) {
  const fg = isDark ? "#d4d4d4" : "#1e1e1e";
  const bg = isDark ? "#1e1e1e" : "#ffffff";
  const gutter = isDark ? "#858585" : "#999999";
  return EditorView.theme(
    {
      "&": { color: fg, backgroundColor: bg, height: "100%", fontSize: "13px" },
      ".cm-content": {
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        caretColor: fg,
      },
      ".cm-scroller": { overflow: "auto" },
      ".cm-gutters": {
        backgroundColor: bg,
        color: gutter,
        border: "none",
      },
      ".bn-liquid-output": { color: isDark ? "#9cdcfe" : "#0451a5" },
      ".bn-liquid-tag": {
        color: isDark ? "#c586c0" : "#af00db",
        fontWeight: "bold",
      },
      ".bn-liquid-comment": { color: isDark ? "#6a9955" : "#008000" },
    },
    { dark: isDark },
  );
}

/** The minimal Monaco-shaped facade the host window drives. */
function makeFacade(view: EditorView) {
  const monaco = {
    Range: class implements MonacoRange {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
      constructor(sl: number, sc: number, el: number, ec: number) {
        this.startLineNumber = sl;
        this.startColumn = sc;
        this.endLineNumber = el;
        this.endColumn = ec;
      }
    },
  };

  const editor = {
    getValue: () => view.state.doc.toString(),
    setValue: (value: string) =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value ?? "" },
      }),
    focus: () => view.focus(),
    getSelection: (): MonacoRange => {
      const sel = view.state.selection.main;
      const a = offsetToPos(view.state, sel.from);
      const b = offsetToPos(view.state, sel.to);
      return {
        startLineNumber: a.lineNumber,
        startColumn: a.column,
        endLineNumber: b.lineNumber,
        endColumn: b.column,
      };
    },
    setSelection: (range: MonacoRange) => {
      const anchor = posToOffset(
        view.state,
        range.startLineNumber,
        range.startColumn,
      );
      const head = posToOffset(
        view.state,
        range.endLineNumber,
        range.endColumn,
      );
      view.dispatch({ selection: { anchor, head } });
      view.focus();
    },
    executeEdits: (
      _source: string,
      edits: { range: MonacoRange; text: string }[],
    ) => {
      const changes = edits.map((e) => ({
        from: posToOffset(
          view.state,
          e.range.startLineNumber,
          e.range.startColumn,
        ),
        to: posToOffset(view.state, e.range.endLineNumber, e.range.endColumn),
        insert: e.text,
      }));
      // CM requires sorted, non-overlapping changes; sort defensively.
      changes.sort((a, b) => a.from - b.from);
      view.dispatch({ changes });
    },
    getModel: () => ({
      getValueInRange: (range: MonacoRange) =>
        view.state.sliceDoc(
          posToOffset(view.state, range.startLineNumber, range.startColumn),
          posToOffset(view.state, range.endLineNumber, range.endColumn),
        ),
      getLinesContent: () => {
        const out: string[] = [];
        for (let i = 1; i <= view.state.doc.lines; i++) {
          out.push(view.state.doc.line(i).text);
        }
        return out;
      },
    }),
  };

  return { monaco, editor };
}

/**
 * Build the editor and return the host-facing facade. Named `loadMonaco` to
 * match the call site the host window already uses (`editorWin.loadMonaco`).
 */
async function loadMonaco(options: { theme?: string } = {}) {
  const isDark = (options.theme || "").includes("dark");
  const root = document.getElementById("cm-root") || document.body;
  root.innerHTML = "";

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const onDocChanged = EditorView.updateListener.of((u: ViewUpdate) => {
    if (!u.docChanged) {
      return;
    }
    // Debounced live-preview refresh, driven by the host window. Must be the
    // PREVIEW-ONLY hook: the host's full refresh() re-renders the template table
    // and drops the selection, which hides the editor (flash-then-disappear).
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      try {
        (
          window.parent as unknown as { refreshPreview?: () => void }
        )?.refreshPreview?.();
      } catch (e) {
        // host gone / not ready
      }
    }, 250);
  });

  const view = new EditorView({
    parent: root,
    state: EditorState.create({
      doc: "",
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        liquidHighlight,
        autocompletion({
          override: [liquidCompletionSource],
          activateOnTyping: true,
          icons: false,
        }),
        keymap.of([
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.lineWrapping,
        buildTheme(isDark),
        onDocChanged,
      ],
    }),
  });

  return makeFacade(view);
}

// Expose to the iframe window so the host can call it (same shape as before).
(window as unknown as { loadMonaco: typeof loadMonaco }).loadMonaco =
  loadMonaco;
