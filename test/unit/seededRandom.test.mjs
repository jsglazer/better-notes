/**
 * Better Notes — unit tests for the dependency-free seeded PRNG
 * (src/utils/seededRandom.ts) that replaced the `seedrandom` package. Bundled to
 * /tmp/bn_seeded by bn_run_seeded_random_tests.sh, run with `node --test`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const BUNDLES = fileURLToPath(new URL("../.bundles", import.meta.url));
const { seededRandom } = require(join(BUNDLES, "seededRandom.cjs"));

function sequence(seed, n = 16) {
  const r = seededRandom(seed);
  return Array.from({ length: n }, () => r());
}

// Mirrors randomString()'s use of the generator.
function makeString(len, seed, chars = "0123456789ABCDEF") {
  const r = seededRandom(seed);
  let s = "";
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(r() * chars.length)];
  }
  return s;
}

test("same seed → identical sequence (deterministic)", () => {
  assert.deepEqual(sequence("hello"), sequence("hello"));
});

test("different seeds → different sequences", () => {
  assert.notDeepEqual(sequence("hello"), sequence("world"));
});

test("output is always in [0, 1)", () => {
  for (const seed of ["", "a", "abc", "9e107d9d372bb6826bd81d3542a419d6"]) {
    for (const v of sequence(seed, 200)) {
      assert.ok(v >= 0 && v < 1, `value ${v} out of range for seed ${seed}`);
    }
  }
});

test("derived key is stable for the same seed (key-derivation use case)", () => {
  const seed = "5d41402abc4b2a76b9719d911017c592"; // md5("hello")
  assert.equal(makeString(8, seed), makeString(8, seed));
});

test("different content seed → different key", () => {
  assert.notEqual(
    makeString(8, "5d41402abc4b2a76b9719d911017c592"),
    makeString(8, "7d793037a0760186574b0282f2f435e7"),
  );
});

test("no seed → non-deterministic across calls", () => {
  // Two independent generators with no seed should (overwhelmingly) differ.
  assert.notDeepEqual(sequence(undefined), sequence(undefined));
});

test("rough uniformity across charset buckets", () => {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const counts = new Array(chars.length).fill(0);
  const r = seededRandom("distribution-seed");
  const N = 36000;
  for (let i = 0; i < N; i++) {
    counts[Math.floor(r() * chars.length)]++;
  }
  const expected = N / chars.length; // 1000
  for (const c of counts) {
    // Generous bound — just catch gross bias, not a statistical test.
    assert.ok(c > expected * 0.7 && c < expected * 1.3, `bucket count ${c}`);
  }
});
