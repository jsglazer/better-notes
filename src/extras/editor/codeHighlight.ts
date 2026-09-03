import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import hljs from "highlight.js/lib/core";

import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import sql from "highlight.js/lib/languages/sql";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

export { initCodeHighlightPlugin };
// Exported for unit testing: the offset math below is the fragile part.
export { tokenize, decodeLength };

/**
 * U22: syntax highlighting for code blocks.
 *
 * highlight.js is imported from `lib/core` with an explicit language list
 * rather than the default bundle: the full package ships ~190 grammars (~1.5 MB
 * of source) and this script is injected and parsed for *every* note editor
 * that opens, not once per session.
 *
 * The list below is deliberately short (U22b) and covers what tends to get
 * pasted into research notes. A fence naming anything else is not an error —
 * `resolveLanguage` returns undefined and the block falls back to
 * `highlightAuto`, which is also more accurate with fewer candidates.
 *
 * Highlighting is applied as inline decorations over the existing text, so the
 * document is never rewritten — no transaction, no dirty note, no sync.
 */

const LANGUAGES: Record<string, any> = {
  bash,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  python,
  r,
  sql,
  xml,
  yaml,
};

/**
 * Common spellings users actually type in a fence.
 *
 * `ts`/`tsx` deliberately resolve to the JavaScript grammar: the TypeScript
 * grammar was dropped (U22b) to keep the injected script small, and JavaScript
 * highlights TypeScript closely enough to be worth the zero extra bytes.
 * Fences for languages with no grammar left (c, cpp, rust, …) simply fall
 * through to `highlightAuto`.
 */
const ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "javascript",
  tsx: "javascript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  html: "xml",
  svg: "xml",
  golang: "go",
  postgres: "sql",
  psql: "sql",
  md: "markdown",
};

let registered = false;

function registerLanguages() {
  if (registered) {
    return;
  }
  for (const [name, language] of Object.entries(LANGUAGES)) {
    try {
      hljs.registerLanguage(name, language);
    } catch (e) {
      console.warn(`EN: Failed to register language ${name}`, e);
    }
  }
  registered = true;
}

function initCodeHighlightPlugin(plugins: readonly Plugin[]) {
  console.log("Init EN Code Highlight Plugin");
  registerLanguages();
  return [
    ...plugins,
    new Plugin({
      key: new PluginKey("enhancedNotesCodeHighlight"),
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

  state.doc.descendants((node: any, pos: number) => {
    // Zotero's schema calls it codeBlock; accept code_block too in case the
    // schema name differs across versions.
    const name = node.type.name;
    if (name !== "codeBlock" && name !== "code_block") {
      return true;
    }
    const code = node.textContent;
    if (!code.trim()) {
      return false;
    }
    const language = resolveLanguage(node.attrs?.language);
    let emitted;
    try {
      emitted = language
        ? hljs.highlight(code, { language, ignoreIllegals: true })
        : hljs.highlightAuto(code, Object.keys(LANGUAGES));
    } catch (e) {
      // A grammar that throws must never take the editor with it.
      return false;
    }
    // +1 to step inside the code block node to its text content.
    const base = pos + 1;
    for (const token of tokenize(emitted.value)) {
      if (!token.className) {
        continue;
      }
      decorations.push(
        Decoration.inline(base + token.from, base + token.to, {
          class: token.className,
        }),
      );
    }
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

function resolveLanguage(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }
  const name = raw.trim().toLowerCase();
  const resolved = ALIASES[name] ?? name;
  return LANGUAGES[resolved] ? resolved : undefined;
}

interface Token {
  from: number;
  to: number;
  className: string;
}

/**
 * Walk highlight.js's HTML output and convert it into offset ranges over the
 * *plain* text, which is what ProseMirror decorations address. Only the span
 * nesting and text lengths matter, so a small scanner is enough — and avoids
 * depending on a DOM inside the worker-like editor context.
 */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const open: { className: string; from: number }[] = [];
  let offset = 0;
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      offset += decodeLength(html.slice(i));
      break;
    }
    if (lt > i) {
      offset += decodeLength(html.slice(i, lt));
    }
    const gt = html.indexOf(">", lt);
    if (gt === -1) {
      break;
    }
    const tag = html.slice(lt + 1, gt);
    if (tag.startsWith("/")) {
      const started = open.pop();
      if (started) {
        tokens.push({
          from: started.from,
          to: offset,
          className: started.className,
        });
      }
    } else {
      const classMatch = /class="([^"]*)"/.exec(tag);
      open.push({ className: classMatch?.[1] ?? "", from: offset });
    }
    i = gt + 1;
  }

  return tokens.filter((token) => token.to > token.from);
}

/** Length of an HTML fragment once entities are resolved. */
function decodeLength(text: string): number {
  return text.replace(/&(?:lt|gt|amp|quot|#x27|#39);/g, " ").length;
}
