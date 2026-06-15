/**
 * Dependency-free deterministic PRNG — replaces the `seedrandom` package.
 *
 * `xmur3` hashes a string seed to a 32-bit value; `mulberry32` turns that into a
 * uniform [0, 1) generator. The same seed always yields the same sequence — used
 * to derive STABLE annotation/citation/link keys from a content md5 (so the same
 * note content maps to the same embedded key). An empty/undefined seed gets a
 * fresh entropy seed, so the output is non-deterministic (e.g. temp-file names).
 *
 * Pure (no Zotero/DOM) → unit-tested directly. Both functions are the standard,
 * widely-used public-domain implementations.
 */

/** Hash a string to a 32-bit seed state (xmur3). */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** 32-bit-seeded uniform [0, 1) generator (mulberry32). */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a [0, 1) PRNG. Deterministic when `seed` is a non-empty string; seeded
 * from fresh entropy (so non-deterministic) otherwise.
 */
export function seededRandom(seed?: string): () => number {
  const s = seed && seed.length ? seed : `${Date.now()}-${Math.random()}`;
  return mulberry32(xmur3(s)());
}
