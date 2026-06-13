import { LargePrefHelper } from "zotero-plugin-toolkit";

/**
 * Minimal key/value store contract used for persistent plugin data
 * (note templates and per-note sync state).
 *
 * Both subsystems persist through this single interface so they are decoupled
 * from the concrete backend. Today the backend is Zotero prefs via the toolkit's
 * `LargePrefHelper` (synchronous reads). `createStore()` is the one seam where a
 * future DB-backed implementation is swapped in (see brainstorm.md U1b) — at
 * which point only this file changes, not the ~75 call sites.
 *
 * The interface is deliberately the synchronous subset that `LargePrefHelper`
 * already provides, so a backend swap must preserve synchronous reads (e.g. via
 * an in-memory cache loaded at startup).
 */
export interface KVStore {
  /** All stored keys. */
  getKeys(): string[];
  /** Replace the full key list. */
  setKeys(keys: string[]): void;
  /** Value for a key (parsed), or undefined. */
  getValue(key: string): any;
  /** Set a key's value (serialized by the backend). */
  setValue(key: string, value: any): void;
  /** Whether a key exists. */
  hasKey(key: string): boolean;
  /** Register a key with no/empty value. */
  setKey(key: string): void;
  /** Remove a key and its value. Returns whether it existed. */
  deleteKey(key: string): boolean;
}

type LargePrefHooks = ConstructorParameters<typeof LargePrefHelper>[2];

/**
 * Construct the backing store for a logical dataset.
 *
 * @param keyPref          Pref holding the JSON array of keys.
 * @param valuePrefPrefix  Pref-name prefix under which each value is stored.
 * @param hooks            Value (de)serialization mode — defaults to JSON (`"parser"`).
 *
 * NOTE (U1b): replace the body with a DB-backed `KVStore` once it has been
 * verified in a live Zotero. `LargePrefHelper` structurally satisfies `KVStore`.
 */
export function createStore(
  keyPref: string,
  valuePrefPrefix: string,
  hooks: LargePrefHooks = "parser",
): KVStore {
  return new ztoolkit.LargePref(keyPref, valuePrefPrefix, hooks) as KVStore;
}
