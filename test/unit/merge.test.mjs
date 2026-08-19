/**
 * Enhanced Notes U2b — unit tests for the pure 3-way merge (src/modules/sync/merge.ts).
 * Bundled to /tmp/bn_u2b by bn_run_merge_tests.sh, run with `node --test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const BUNDLES = fileURLToPath(new URL("../.bundles", import.meta.url));
const { threeWayMerge } = require(join(BUNDLES, "merge.cjs"));

test("identical sides → clean, unchanged", () => {
  const r = threeWayMerge("a\nb\nc", "a\nb\nc", "a\nb\nc");
  assert.equal(r.clean, true);
  assert.equal(r.text, "a\nb\nc");
});

test("only mine changed → take mine", () => {
  const r = threeWayMerge("a\nb\nc", "a\nB\nc", "a\nb\nc");
  assert.equal(r.clean, true);
  assert.equal(r.text, "a\nB\nc");
});

test("only theirs changed → take theirs", () => {
  const r = threeWayMerge("a\nb\nc", "a\nb\nc", "a\nb\nC");
  assert.equal(r.clean, true);
  assert.equal(r.text, "a\nb\nC");
});

test("disjoint edits on different lines → both applied", () => {
  const r = threeWayMerge("a\nb\nc", "A\nb\nc", "a\nb\nC");
  assert.equal(r.clean, true);
  assert.equal(r.text, "A\nb\nC");
});

test("both changed the SAME line differently → conflict", () => {
  const r = threeWayMerge("a\nb\nc", "a\nX\nc", "a\nY\nc");
  assert.equal(r.clean, false);
});

test("both made the IDENTICAL change → clean", () => {
  const r = threeWayMerge("a\nb\nc", "a\nZ\nc", "a\nZ\nc");
  assert.equal(r.clean, true);
  assert.equal(r.text, "a\nZ\nc");
});

test("insertion by mine only → applied", () => {
  const r = threeWayMerge("a\nc", "a\nb\nc", "a\nc");
  assert.equal(r.clean, true);
  assert.equal(r.text, "a\nb\nc");
});

test("insertion by each at different spots → both applied", () => {
  const r = threeWayMerge("a\nb\nc", "start\na\nb\nc", "a\nb\nc\nend");
  assert.equal(r.clean, true);
  assert.equal(r.text, "start\na\nb\nc\nend");
});

test("deletion by mine only → applied", () => {
  const r = threeWayMerge("a\nb\nc", "a\nc", "a\nb\nc");
  assert.equal(r.clean, true);
  assert.equal(r.text, "a\nc");
});

test("empty base, both add same → clean; different → conflict", () => {
  assert.equal(threeWayMerge("", "x", "x").clean, true);
  assert.equal(threeWayMerge("", "x", "y").clean, false);
});

test("trailing newline preserved", () => {
  const r = threeWayMerge("a\nb\n", "a\nB\n", "a\nb\n");
  assert.equal(r.clean, true);
  assert.equal(r.text, "a\nB\n");
});

test("realistic note: append a line on one side, edit another on the other", () => {
  const base = "# Title\n\n- point one\n- point two\n";
  const mine = "# Title\n\n- point one EDITED\n- point two\n";
  const theirs = "# Title\n\n- point one\n- point two\n- point three\n";
  const r = threeWayMerge(base, mine, theirs);
  assert.equal(r.clean, true);
  assert.equal(
    r.text,
    "# Title\n\n- point one EDITED\n- point two\n- point three\n",
  );
});
