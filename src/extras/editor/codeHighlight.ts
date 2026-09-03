import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import hljs from "highlight.js/lib/core";

import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

export { initCodeHighlightPlugin };
// Exported for unit testing: the offset math below is the fragile part.
export { tokenize, decodeLength };

/**
 * U22: syntax highlighting for code blocks.
 *
 * highlight.js is imported from `lib/core` with an explicit language list
 * rather than the default bundle: the full package registers ~190 grammars and
 * would dominate the size of the injected editor script, which is parsed on
 * every editor open.
 *
 * Highlighting is applied as inline decorations over the existing text, so the
 * document is never rewritten — no transaction, no dirty note, no sync.
 */

const LANGUAGES: Record<string, any> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  php,
  python,
  r,
  ruby,
  rust,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

/** Common spellings users actually type in a fence. */
const ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  html: "xml",
  svg: "xml",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  rb: "ruby",
  rs: "rust",
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
