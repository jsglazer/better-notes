/**
 * Enhanced Notes — unit tests for the pure annotation grouping
 * (src/utils/annotationGroup.ts). Bundled to /tmp/bn_anngroup by
 * bn_run_annotation_group_tests.sh, run with `node --test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const BUNDLES = fileURLToPath(new URL("../.bundles", import.meta.url));
const { groupAnnotationPieces, orderLabels, parseSectionOrder, DEFAULT_SECTION_ORDER } =
  require(join(BUNDLES, "annotationGroup.cjs"));

const ORDER = DEFAULT_SECTION_ORDER;

test("parseSectionOrder: empty/undefined falls back to default", () => {
  assert.deepEqual(parseSectionOrder(""), DEFAULT_SECTION_ORDER);
  assert.deepEqual(parseSectionOrder(undefined), DEFAULT_SECTION_ORDER);
  assert.deepEqual(parseSectionOrder("   "), DEFAULT_SECTION_ORDER);
});

test("parseSectionOrder: trims and drops blanks", () => {
  assert.deepEqual(parseSectionOrder(" Key , Nav ,, "), ["Key", "Nav"]);
});

test("orderLabels: configured order first, extras in encounter order", () => {
  const present = ["Nav", "Key", "Custom", "Background"];
  assert.deepEqual(orderLabels(present, ORDER), [
    "Background",
    "Key",
    "Nav",
    "Custom",
  ]);
});

test("orderLabels: only present labels appear", () => {
  assert.deepEqual(orderLabels(["Key"], ORDER), ["Key"]);
});

test("group: buckets by label, ordered by section order", () => {
  const pieces = [
    { colorLabel: "Nav", html: "<p>n1</p>" },
    { colorLabel: "Key", html: "<p>k1</p>" },
    { colorLabel: "Background", html: "<p>b1</p>" },
    { colorLabel: "Key", html: "<p>k2</p>" },
  ];
  const html = groupAnnotationPieces(pieces, ORDER);
  assert.equal(
    html,
    "<h2>Background</h2><p>b1</p><h2>Key</h2><p>k1</p><p>k2</p><h2>Nav</h2><p>n1</p>",
  );
});

test("group: unlabeled pieces go to a trailing Other section", () => {
  const pieces = [
    { colorLabel: "Key", html: "<p>k</p>" },
    { colorLabel: "", html: "<p>u1</p>" },
    { colorLabel: "  ", html: "<p>u2</p>" },
  ];
  const html = groupAnnotationPieces(pieces, ORDER);
  assert.equal(html, "<h2>Key</h2><p>k</p><h2>Other</h2><p>u1</p><p>u2</p>");
});

test("group: labels not in order appended after, in encounter order", () => {
  const pieces = [
    { colorLabel: "Zeta", html: "<p>z</p>" },
    { colorLabel: "Key", html: "<p>k</p>" },
    { colorLabel: "Alpha", html: "<p>a</p>" },
  ];
  const html = groupAnnotationPieces(pieces, ORDER);
  assert.equal(
    html,
    "<h2>Key</h2><p>k</p><h2>Zeta</h2><p>z</p><h2>Alpha</h2><p>a</p>",
  );
});

test("group: label text is HTML-escaped in the heading", () => {
  const pieces = [{ colorLabel: "A & <B>", html: "<p>x</p>" }];
  const html = groupAnnotationPieces(pieces, ["A & <B>"]);
  assert.equal(html, "<h2>A &amp; &lt;B&gt;</h2><p>x</p>");
});

test("group: empty input → empty string", () => {
  assert.equal(groupAnnotationPieces([], ORDER), "");
});
