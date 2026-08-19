/**
 * Enhanced Notes — unit tests for the template-editor autocomplete resolver
 * (src/modules/template/completions.ts). Bundled by test/bundle.mjs, run with
 * `node --test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const BUNDLES = fileURLToPath(new URL("../.bundles", import.meta.url));
const { computeCompletion, VARIABLES, ITEM_FIELDS, NOTE_FIELDS, CREATOR_FIELDS, FILTERS, TAGS } =
  require(join(BUNDLES, "completions.cjs"));

const labels = (r) => r.options.map((o) => o.label);
/** Helper: cursor at end of the given prefix. */
const at = (doc) => computeCompletion(doc, doc.length);

test("no completion in plain text", () => {
  assert.equal(at("# Just a heading"), null);
  assert.equal(at("item.title outside braces"), null);
});

test("variables offered right after {{", () => {
  const r = at("{{ ");
  assert.deepEqual(labels(r), VARIABLES.map((e) => e.label));
});

test("variable prefix narrows token span (from)", () => {
  const doc = "{{ it";
  const r = computeCompletion(doc, doc.length);
  assert.equal(r.from, doc.length - 2); // replaces "it"
  assert.ok(labels(r).includes("item"));
});

test("item. → item fields", () => {
  const r = at("{{ item.");
  assert.deepEqual(labels(r), ITEM_FIELDS.map((e) => e.label));
});

test("item.ti → item fields, replacing fragment", () => {
  const doc = "{{ item.ti";
  const r = computeCompletion(doc, doc.length);
  assert.equal(r.from, doc.length - 2); // replaces "ti"
  assert.ok(labels(r).includes("title"));
});

test("note. → note fields", () => {
  assert.deepEqual(labels(at("{{ note.")), NOTE_FIELDS.map((e) => e.label));
});

test("items[0]. → item fields", () => {
  assert.deepEqual(labels(at("{{ items[0].")), ITEM_FIELDS.map((e) => e.label));
});

test("item.authors[0]. → creator fields", () => {
  assert.deepEqual(labels(at("{{ item.authors[0].")), CREATOR_FIELDS.map((e) => e.label));
});

test("filter position after | → filters", () => {
  assert.deepEqual(labels(at("{{ item.title | ")), FILTERS.map((e) => e.label));
  assert.ok(labels(at("{{ now | da")).includes("date"));
});

test("tag name position → tags", () => {
  assert.deepEqual(labels(at("{% ")), TAGS.map((e) => e.label));
  assert.ok(labels(at("{% fo")).includes("for"));
});

test("expression inside a tag completes variables", () => {
  assert.ok(labels(at("{% if item.")).includes("title"));
});

test("loop variable resolves to creator fields via doc scan", () => {
  const doc = "{% for a in item.authors %}\n{{ a.";
  const r = computeCompletion(doc, doc.length);
  assert.deepEqual(labels(r), CREATOR_FIELDS.map((e) => e.label));
});

test("loop variable over items resolves to item fields", () => {
  const doc = "{% for x in items %}\n{{ x.";
  const r = computeCompletion(doc, doc.length);
  assert.deepEqual(labels(r), ITEM_FIELDS.map((e) => e.label));
});

test("unknown base → no completion", () => {
  assert.equal(at("{{ mystery."), null);
});

test("forloop. → loop fields", () => {
  const doc = "{% for x in items %}{{ forloop.";
  const r = computeCompletion(doc, doc.length);
  assert.ok(labels(r).includes("last"));
});

test("closed delimiter does not complete", () => {
  // cursor after a fully-closed {{ }} then plain text
  const doc = "{{ item.title }} and then ";
  assert.equal(computeCompletion(doc, doc.length), null);
});

test("every entry carries detail + info + kind", () => {
  for (const list of [VARIABLES, ITEM_FIELDS, NOTE_FIELDS, CREATOR_FIELDS, FILTERS, TAGS]) {
    for (const e of list) {
      assert.ok(e.label && e.detail && e.info && e.kind, `incomplete entry: ${JSON.stringify(e)}`);
    }
  }
});
