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
  // The point of this test is the *run boundary*: "Intro" must not be merged
  // into the same paragraph as "Body one". The blank lines that used to sit
  // around the heading were removed in U22c — they were not in the note, and
  // re-adding them on every sync is what made deleting them in Obsidian
  // appear to do nothing.
  assert.equal(md, "Intro\n## Section\nBody one\nBody two\n");
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
  // Indented with tabs since U22d, to match what Obsidian writes; the point
  // of this test is that the three levels of nesting survive at all.
  assert.equal(md, "- Parent\n\t- Child\n\t\t- Grand\n");
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

test("an Obsidian callout survives the round trip unescaped", async () => {
  const md = "> [!note] Title here\n> Body line one\n> Body line two\n";
  const out = await md2note(md);
  // Each body line is its own <p>, matching how Zotero models a visual line.
  assert.equal(
    out,
    "<blockquote>\n<p>[!note] Title here</p>\n<p>Body line one</p>\n<p>Body line two</p>\n</blockquote>",
  );
  const back = await note2md(out);
  // The marker must not come back escaped (`\[!note]`), or Obsidian stops
  // recognising the callout and it degrades to a plain quote.
  assert.equal(back, md);
});

test("a multi-line block quote keeps its lines separate", async () => {
  const md = "> A plain quote\n> second line\n";
  assert.equal(await note2md(await md2note(md)), md);
});

test("no blank line is forced around a heading", async () => {
  // Reported in U22c: deleting these blank lines in Obsidian did nothing,
  // because the next sync rewrote the file with them put back.
  const md = "### Level 3\n- Bullets\n- More\n";
  assert.equal(await note2md(await md2note(md)), md);
  assert.equal(await note2md(await md2note("Intro\n## Head\nBody\n")), "Intro\n## Head\nBody\n");
});

test("a list directly under a paragraph keeps no blank line", async () => {
  for (const md of ["Some text\n- a\n- b\n", "Some text\n1. a\n2. b\n"]) {
    assert.equal(await note2md(await md2note(md)), md);
  }
});

test("a paragraph AFTER a list keeps its blank line", async () => {
  // Without the blank line the paragraph becomes a lazy continuation of the
  // last list item, silently swallowing it into the bullet.
  const md = "- a\n- b\n\nAfter the list\n";
  const out = await note2md(await md2note(md));
  assert.equal(out, md);
  assert.match(out, /- b\n\nAfter/);
});

test("nested list items are indented with tabs, as Obsidian writes them", async () => {
  // U22d: remark-stringify indents by the parent's content offset (2 spaces
  // under "- ", 3 under "1. "), so every sync rewrote the user's tabs as
  // spaces — the list still nested, but the file churned and rendered
  // shallower than lists authored in Obsidian beside it.
  for (const md of [
    "- Obsidian\n\t- Indent\n\t\t- Deeper\n",
    "1. one\n\t1. sub\n\t2. sub2\n2. two\n",
    "- bullet\n\t1. num\n\t\t- deep\n",
  ]) {
    assert.equal(await note2md(await md2note(md)), md);
  }
});

test("a list-like line inside a code fence is not re-indented", async () => {
  const md = "```\n- not a bullet\n  - nor this\n```\n";
  assert.equal(await note2md(await md2note(md)), md);
});

test("an empty <p> inside a list item is layout, not a blank line", async () => {
  // Must not be treated as a paragraph break; the list stays a single list.
  const { md } = await assertStable(note("<ul><li><p></p>Item</li></ul>"));
  assert.match(md, /^- Item/);
});
