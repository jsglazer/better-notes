/**
 * Enhanced Notes U21 — round-trip tests for the note <-> markdown conversion
 * (src/extras/convert.ts).
 *
 * The rules under test:
 *  - Zotero makes every visual line its own <p>; markdown should mirror that
 *    compactly (single newline), not double-space every line.
 *  - An empty <p> is a deliberate blank line and must survive both directions.
 *  - Inline HTML inside a list item (highlights, colors) must not be stripped.
 *  - note -> md -> note must be *stable*: converting repeatedly may not keep
 *    changing the content, or every sync would report a spurious change.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const BUNDLES = fileURLToPath(new URL("../.bundles", import.meta.url));
const C = require(join(BUNDLES, "convert.cjs"));

const note2md = async (html) =>
  C.remark2md(await C.rehype2remark(C.note2rehype(html)));
const md2note = async (md) =>
  C.rehype2note(await C.remark2rehype(C.md2remark(md)));

/** Wrap fragment HTML the way Zotero stores a note. */
const note = (inner) => `<div data-schema-version="9">${inner}</div>`;

/** Assert note -> md -> note -> md settles instead of drifting. */
async function assertStable(html) {
  const md1 = await note2md(html);
  const note1 = await md2note(md1);
  const md2 = await note2md(note1);
  const note2 = await md2note(md2);
  assert.equal(md2, md1, "markdown drifted on the second pass");
  assert.equal(note2, note1, "note HTML drifted on the second pass");
  return { md: md1, note: note1 };
}

test("consecutive lines stay compact instead of double-spaced", async () => {
  const { md } = await assertStable(
    note("<p>Line one</p>\n<p>Line two</p>\n<p>Line three</p>"),
  );
  assert.equal(md, "Line one\nLine two\nLine three\n");
});

test("an empty <p> is preserved as a real blank line", async () => {
  const { md, note: out } = await assertStable(
    note("<p>A</p>\n<p>B</p>\n<p></p>\n<p>C</p>"),
  );
  assert.equal(md, "A\nB\n\nC\n");
  assert.match(out, /<p><\/p>/);
});

test("a blank line in markdown comes back as an empty <p>", async () => {
  const out = await md2note("A\nB\n\nC\n");
  assert.equal(out, "<p>A</p>\n<p>B</p>\n<p></p>\n<p>C</p>");
});

test("a heading ends a paragraph run", async () => {
  const { md } = await assertStable(
    note("<p>Intro</p>\n<h2>Section</h2>\n<p>Body one</p>\n<p>Body two</p>"),
  );
  assert.equal(md, "Intro\n\n## Section\n\nBody one\nBody two\n");
});

test("inline highlight inside a list item survives the round trip", async () => {
  const { md, note: out } = await assertStable(
    note(
      '<ul><li>Item with <span style="background-color: #ffd400">highlight</span> inside</li><li>Plain</li></ul>',
    ),
  );
  assert.match(md, /background-color: #ffd400/);
  assert.match(out, /background-color: #ffd400/);
  // The style must not gain a nesting level on each pass.
  assert.doesNotMatch(out, /<span[^>]*><span><span>/);
});

test("nested sub-bullets keep their indentation", async () => {
  const { md } = await assertStable(
    note(
      "<ul><li>Parent<ul><li>Child<ul><li>Grand</li></ul></li></ul></li></ul>",
    ),
  );
  assert.equal(md, "- Parent\n  - Child\n    - Grand\n");
});

test("inline and display math round-trip unchanged", async () => {
  const { md, note: out } = await assertStable(
    note(
      '<p>Inline <span class="math">$E=mc^2$</span> here.</p>\n<pre class="math">$$\\int_0^1 x^2 dx$$</pre>',
    ),
  );
  assert.match(md, /\$E=mc\^2\$/);
  assert.match(md, /\$\$\n\\int_0\^1 x\^2 dx\n\$\$/);
  assert.match(out, /<span class="math">\$E=mc\^2\$<\/span>/);
});

test("paragraphs after a list are not merged into it", async () => {
  const { md } = await assertStable(
    note("<ul><li>A</li><li>B</li></ul>\n<p>After one</p>\n<p>After two</p>"),
  );
  assert.equal(md, "- A\n- B\n\nAfter one\nAfter two\n");
});

test("an empty <p> inside a list item is layout, not a blank line", async () => {
  // Must not be treated as a paragraph break; the list stays a single list.
  const { md } = await assertStable(note("<ul><li><p></p>Item</li></ul>"));
  assert.match(md, /^- Item/);
});
