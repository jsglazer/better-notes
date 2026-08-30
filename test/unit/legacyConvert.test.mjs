/**
 * Enhanced Notes — unit tests for the legacy-JS → Liquid template converter
 * (src/modules/template/legacyConvert.ts). Bundled by test/bundle.mjs, run with
 * `node --test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const BUNDLES = fileURLToPath(new URL("../.bundles", import.meta.url));
const { convertLegacyTemplate, convertExpression } = require(
  join(BUNDLES, "legacyConvert.cjs"),
);

test("convertExpression: getField maps known fields", () => {
  assert.equal(
    convertExpression('topItem.getField("title")').liquid,
    "{{ item.title }}",
  );
  assert.equal(
    convertExpression("topItem.getField('DOI')").liquid,
    "{{ item.doi }}",
  );
  assert.equal(
    convertExpression('topItem.getField("abstractNote")').liquid,
    "{{ item.abstract }}",
  );
});

test("convertExpression: unknown field flagged (null)", () => {
  assert.equal(
    convertExpression('topItem.getField("publicationTitle")').liquid,
    null,
  );
});

test("convertExpression: citationKey with guard maps to citekey", () => {
  assert.equal(
    convertExpression('topItem.citationKey ? topItem.citationKey : ""').liquid,
    "{{ item.citekey }}",
  );
});

test("convertExpression: creators join → for loop with separator", () => {
  const out = convertExpression(
    'topItem.getCreators().map((au) => au.firstName + " " + au.lastName).join("; ")',
  ).liquid;
  assert.match(out, /\{% for x in item\.authors %\}/);
  assert.match(out, /\{\{ x\.firstName \}\} \{\{ x\.lastName \}\}/);
  assert.match(out, /\{% unless forloop\.last %\}; \{% endunless %\}/);
});

test("convertExpression: tags map → for loop, default separator", () => {
  const out = convertExpression(
    "topItem.getTags().map(tagObj=>tagObj.tag)",
  ).liquid;
  assert.match(out, /\{% for x in item\.tags %\}\{\{ x \}\}/);
});

test("convertExpression: new Date() → now filter", () => {
  assert.match(
    convertExpression("new Date().toLocaleString()").liquid,
    /now \| date:/,
  );
});

test("convertExpression: unrecognised → null", () => {
  assert.equal(convertExpression("someRandom.thing()").liquid, null);
});

test("convert: already-Liquid passthrough", () => {
  const r = convertLegacyTemplate("<!--liquid-->\n{{ item.title }}");
  assert.equal(r.alreadyLiquid, true);
  assert.equal(r.liquid, "<!--liquid-->\n{{ item.title }}");
});

test("convert: use-markdown pragma → sentinel + header", () => {
  const r = convertLegacyTemplate(
    '// @use-markdown\n# ${topItem.getField("title")}',
    "item",
  );
  assert.match(r.liquid, /^<!--liquid-->\n<!--markdown-->/);
  assert.match(r.liquid, /\{\{ item\.title \}\}/);
  assert.equal(r.manual, 0);
  assert.ok(r.mapped >= 1);
});

test("convert: topItem body gets wrapped in per-item loop", () => {
  const r = convertLegacyTemplate(
    'Title: ${topItem.getField("title")}',
    "item",
  );
  assert.match(r.liquid, /\{% for item in items %\}/);
  assert.match(r.liquid, /\{% endfor %\}/);
});

test("convert: text template is not loop-wrapped", () => {
  const r = convertLegacyTemplate("Now: ${new Date()}", "text");
  assert.doesNotMatch(r.liquid, /\{% for item in items %\}/);
});

test("convert: multi-line block flagged as manual", () => {
  const r = convertLegacyTemplate("${{\nconst a = 1;\nreturn a;\n}}$", "text");
  assert.equal(r.manual, 1);
  assert.match(r.liquid, /BN-MIGRATE/);
});

test("convert: unknown field flagged inline, output still valid Liquid", () => {
  const r = convertLegacyTemplate('${topItem.getField("series")}', "item");
  assert.equal(r.manual, 1);
  assert.match(r.liquid, /\{% comment %\} BN-MIGRATE/);
  assert.match(r.liquid, /\{% endcomment %\}/);
});

test("convert: DOI link with two expressions on one line", () => {
  const r = convertLegacyTemplate(
    "[${topItem.getField(\"DOI\")}](https://doi.org/${topItem.getField('DOI')})",
    "item",
  );
  assert.equal(r.mapped, 2);
  assert.match(
    r.liquid,
    /\[\{\{ item\.doi \}\}\]\(https:\/\/doi\.org\/\{\{ item\.doi \}\}\)/,
  );
});

test("convert: stage markers produce a for-loop from default stage", () => {
  const src = [
    "// @beforeloop-begin",
    "# Bibliography",
    "// @beforeloop-end",
    "// @default-begin",
    '- ${topItem.getField("title")}',
    "// @default-end",
  ].join("\n");
  const r = convertLegacyTemplate(src, "item");
  assert.match(r.liquid, /# Bibliography/);
  assert.match(r.liquid, /\{% for item in items %\}/);
  assert.match(r.liquid, /\{\{ item\.title \}\}/);
});
