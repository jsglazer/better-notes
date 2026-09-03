/**
 * Enhanced Notes U22 — unit tests for the code-highlight tokenizer
 * (src/extras/editor/codeHighlight.ts).
 *
 * ProseMirror decorations address offsets in the *plain* text, but
 * highlight.js returns HTML. The scanner that converts one to the other is the
 * fragile part: if entity decoding or tag skipping is off by even one
 * character, every highlight in the block lands on the wrong text — and in the
 * worst case a decoration runs past the end of the node and throws inside the
 * editor. These tests pin the offset math.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const BUNDLES = fileURLToPath(new URL("../.bundles", import.meta.url));
const { tokenize, decodeLength } = require(join(BUNDLES, "codeHighlight.cjs"));

const hljs = require("highlight.js/lib/core");
hljs.registerLanguage("javascript", require("highlight.js/lib/languages/javascript"));
hljs.registerLanguage("python", require("highlight.js/lib/languages/python"));

function highlight(code, language) {
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}

test("decodeLength counts an entity as one character", () => {
  assert.equal(decodeLength("a&lt;b"), 3);
  assert.equal(decodeLength("&amp;&gt;&quot;"), 3);
  assert.equal(decodeLength("plain"), 5);
});

test("token offsets map back onto the original source exactly", () => {
  const code = 'const x = 1; // hi\nfunction f(a) { return "s" < 2; }';
  const tokens = tokenize(highlight(code, "javascript"));

  // Nothing may point outside the text, or the decoration throws in the editor.
  for (const token of tokens) {
    assert.ok(token.from >= 0 && token.to <= code.length, `out of range: ${JSON.stringify(token)}`);
  }
  // Spot-check that slices line up with what was actually highlighted.
  const slices = tokens.map((t) => [code.slice(t.from, t.to), t.className]);
  assert.deepEqual(slices[0], ["const", "hljs-keyword"]);
  assert.ok(slices.some(([text, cls]) => text === "// hi" && cls === "hljs-comment"));
});

test("escaped characters do not shift later offsets", () => {
  // The `<` becomes &lt; in the HTML; everything after it must still line up.
  const code = 'if (a < b) { return "tail"; }';
  const tokens = tokenize(highlight(code, "javascript"));
  const strings = tokens.filter((t) => t.className.includes("string"));
  assert.ok(strings.length > 0, "expected a highlighted string token");
  assert.equal(code.slice(strings[0].from, strings[0].to), '"tail"');
});

test("nested spans produce ranges for both outer and inner tokens", () => {
  const code = "def f(x):\n    return x";
  const tokens = tokenize(highlight(code, "python"));
  assert.ok(tokens.length >= 2);
  for (const token of tokens) {
    assert.ok(token.to > token.from, "zero-width token should be filtered out");
    assert.ok(token.to <= code.length);
  }
});

test("plain text with no markup yields no tokens", () => {
  assert.deepEqual(tokenize("just text, no tags"), []);
});
