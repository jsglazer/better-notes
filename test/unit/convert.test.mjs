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
  assert.equal(
    await note2md(await md2note("Intro\n## Head\nBody\n")),
    "Intro\n## Head\nBody\n",
  );
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

/* U23 — formulas typed by hand, and the blank line above them. */

test("a hand-typed $…$ formula is not escaped into backslash soup", async () => {
  // Zotero only makes a real math node when you *insert* one; typed TeX stays
  // ordinary text, and markdown then escapes the `$` and the `_`.
  const { md } = await assertStable(
    note("<p>Bayes: $P(A|B) = \\frac{P(B|A)P(A)}{P(B)}$ holds.</p>"),
  );
  assert.equal(md, "Bayes: $P(A|B) = \\frac{P(B|A)P(A)}{P(B)}$ holds.\n");
  assert.doesNotMatch(md, /\\\$/);
});

test("subscripts in a typed formula survive without escaping", async () => {
  const { md } = await assertStable(note("<p>where $x_1^2 + x_2^2 = r^2$</p>"));
  assert.equal(md, "where $x_1^2 + x_2^2 = r^2$\n");
});

test("currency is not mistaken for a formula", async () => {
  // A lone `$` stays escaped, as remark-math requires — the point is that the
  // span between two of them is not swallowed as a formula.
  for (const [inner, expected] of [
    [
      "<p>It costs $5 to $10 per {unit}.</p>",
      "It costs \\$5 to \\$10 per {unit}.\n",
    ],
    [
      "<p>Priced in US$ and shown as $ per item.</p>",
      "Priced in US\\$ and shown as \\$ per item.\n",
    ],
  ]) {
    const { md } = await assertStable(note(inner));
    assert.equal(md, expected);
  }
});

test("a typed $$ block becomes a real display formula, blank line intact", async () => {
  // The lines around the fence are one merged paragraph by the time the
  // promotion runs, so the fence has to be split out of the middle of it.
  const { md } = await assertStable(
    note("<p>Then:</p>\n<p>$$</p>\n<p>E = mc^2</p>\n<p>$$</p>\n<p>Done.</p>"),
  );
  assert.equal(md, "Then:\n\n$$\nE = mc^2\n$$\n\nDone.\n");
});

test("an unclosed $$ fence is left alone", async () => {
  const { md } = await assertStable(note("<p>$$</p>\n<p>never closed</p>"));
  assert.match(md, /never closed/);
});

test("a heading keeps its blank line before a formula", async () => {
  // U22c collapses the blank line after a heading so markdown mirrors Zotero's
  // compact layout — but a display formula is its own block, and the user kept
  // re-adding the line sync kept removing.
  const md = "## Derivation\n\n$$\nE = mc^2\n$$\n";
  assert.equal(await note2md(await md2note(md)), md);
});

test("a heading still hugs the paragraph under it", async () => {
  const { md } = await assertStable(note("<h2>Head</h2>\n<p>Body</p>"));
  assert.equal(md, "## Head\nBody\n");
});

test("an Obsidian [[wikilink]] is not escaped on export", async () => {
  // remark escapes `[` to stop it being read as a link reference; Obsidian then
  // renders the link as literal text, and re-fixing it in the vault only lasts
  // until the next sync.
  for (const md of [
    "See [[17 Simple Linear Regression]] here\n",
    "- cov [[MR-B Fundamentals#MR-B4b — Covariance|MR-B Fundamentals]] #learn\n",
    "[[eq-Econ-LinRegress]]\n",
  ]) {
    assert.equal(await note2md(await md2note(md)), md);
  }
});

test("a real escaped bracket is still escaped", async () => {
  const { md } = await assertStable(note("<p>A literal [[ stays put.</p>"));
  assert.match(md, /\\\[\\\[/);
});

test("math in a table header is not eaten one character per sync", async () => {
  // Pre-existing bug: a table cell stores math as remark-math's bare
  // `class="math math-inline"` with no `$` delimiters, and the export sliced
  // the first and last character off regardless. The damage compounded on
  // every sync: $E(u( = 0)$ -> $(u( = 0$ -> $u( = $ -> $( $ -> $$
  let md =
    "| A | Solve for $u$ | $E(u( = 0)$ |\n| --- | --- | --- |\n| x | y | z |\n";
  const header = () => md.split("\n")[0];
  for (let i = 0; i < 4; i++) {
    md = await note2md(await md2note(md));
    assert.match(header(), /Solve for \$u\$/, `lost \$u\$ on pass ${i + 1}`);
    assert.match(
      header(),
      /\$E\(u\( = 0\)\$/,
      `lost the formula on pass ${i + 1}`,
    );
  }
});

test("a formula that already carries its delimiters is unwrapped once", async () => {
  const { md } = await assertStable(
    note('<p>see <span class="math">$x^2$</span> here</p>'),
  );
  assert.equal(md, "see $x^2$ here\n");
});

/* U23 — the note <-> md round trip must SETTLE, or every sync rewrites the
   file and Obsidian reloads the note under the cursor. */

test("inline math in a bullet keeps its spacing exactly", async () => {
  // Two rules used to fight: rehype2remark's `li` handler padded inline math
  // with a space on each side, and rehype2note took one back off — but only
  // when the neighbour was a text node. Math next to **bold**, or first/last
  // in the bullet, therefore gained a space on every single sync.
  for (const md of [
    "- Ex. $y$ is hourly wage\n",
    "- mean **zero conditional** $E(u) = 0$\n",
    "- $y_i$ is the actual value\n",
    "- the actual value $y_i$\n",
    "- outer\n\t- inner $x^2$ done\n",
    "> 1. $u$ represents factors and $y = \\beta_0$ .\n",
  ]) {
    assert.equal(await note2md(await md2note(md)), md);
  }
});

test("math glued to text without spaces stays glued", async () => {
  const md = "- Ex.$y$is hourly\n";
  assert.equal(await note2md(await md2note(md)), md);
});

test("a table cell keeps the spaces around its math", async () => {
  // A plain <span> was converted to a paragraph, whose leading/trailing
  // whitespace mdast then trims — so `x $y$ z` came back as `x$y$z`.
  const md = "| A   | B       |\n| --- | ------- |\n| $u$ | x $y$ z |\n";
  assert.equal(await note2md(await md2note(md)), md);
});
