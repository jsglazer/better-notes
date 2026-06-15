/**
 * Better Notes — unit tests for the owned worker RPC layer
 * (src/utils/workerRpc.ts + src/extras/lib/serveWorker.ts), which replaced the
 * toolkit's MessageHelper. Bundled to /tmp/bn_worker by
 * bn_run_worker_rpc_tests.sh, run with `node --test`.
 *
 * A fake Worker bridges the main side (WorkerRpc) to a worker `self` scope, so a
 * real request → dispatch → response round trip is exercised in-process.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const BUNDLES = fileURLToPath(new URL("../.bundles", import.meta.url));
const { WorkerRpc, serveWorker } = require(join(BUNDLES, "worker.cjs"));

// Most-recently-constructed fake worker's "self" scope, so the test can attach
// serveWorker to it after WorkerRpc builds the worker internally.
let lastScope;

class FakeWorker {
  constructor() {
    this.terminated = false;
    this._mainMsg = [];
    const workerMsg = [];
    // The worker-side global scope serveWorker() will attach to.
    this.scope = {
      addEventListener: (t, l) => {
        if (t === "message") workerMsg.push(l);
      },
      postMessage: (data) =>
        queueMicrotask(() => this._mainMsg.forEach((l) => l({ data }))),
    };
    // main → worker
    this.postMessage = (data) =>
      queueMicrotask(() => workerMsg.forEach((l) => l({ data })));
    this.addEventListener = (t, l) => {
      if (t === "message") this._mainMsg.push(l);
    };
    this.removeEventListener = (t, l) => {
      this._mainMsg = this._mainMsg.filter((x) => x !== l);
    };
    this.terminate = () => {
      this.terminated = true;
    };
    lastScope = this.scope;
  }
}

globalThis.Worker = FakeWorker;

function makeRpc(handlers, opts = {}) {
  const rpc = new WorkerRpc("fake://url", { name: "test", ...opts });
  globalThis.self = lastScope;
  serveWorker(handlers);
  return rpc;
}

test("ready() resolves via built-in _ping", async () => {
  const rpc = makeRpc({});
  await rpc.ready();
  rpc.terminate();
});

test("proxy call resolves with the handler's return value", async () => {
  const rpc = makeRpc({ echo: (x) => x, add: (a, b) => a + b });
  assert.equal(await rpc.proxy.echo("hi"), "hi");
  assert.equal(await rpc.proxy.add(2, 3), 5);
  rpc.terminate();
});

test("async handlers are awaited", async () => {
  const rpc = makeRpc({ slow: async (x) => x * 2 });
  assert.equal(await rpc.proxy.slow(21), 42);
  rpc.terminate();
});

test("handler exception rejects the caller with its message", async () => {
  const rpc = makeRpc({
    boom: () => {
      throw new Error("nope");
    },
  });
  await assert.rejects(() => rpc.proxy.boom(), /nope/);
  rpc.terminate();
});

test("unknown handler rejects", async () => {
  const rpc = makeRpc({});
  await assert.rejects(() => rpc.proxy.missing(), /no handler 'missing'/);
  rpc.terminate();
});

test("terminate() kills the worker and rejects further calls", async () => {
  const rpc = makeRpc({ echo: (x) => x });
  assert.equal(await rpc.proxy.echo(1), 1);
  rpc.terminate();
  assert.equal(rpc.target.terminated, true);
  await assert.rejects(() => rpc.proxy.echo(2), /terminated/);
});

test("terminate() rejects in-flight calls", async () => {
  // A handler that blocks until released keeps the call in flight across terminate.
  let release;
  const blocker = new Promise((r) => (release = r));
  const rpc = makeRpc({ block: () => blocker });
  const inflight = rpc.proxy.block();
  rpc.terminate();
  await assert.rejects(() => inflight, /terminated/);
  release();
});

test("call times out when the worker never responds", async () => {
  // serveWorker not attached → no responder.
  globalThis.Worker = FakeWorker;
  const rpc = new WorkerRpc("fake://url", { name: "t", timeoutMs: 30 });
  // deliberately do NOT attach serveWorker
  await assert.rejects(() => rpc.proxy.whatever(), /timed out/);
  rpc.terminate();
});

test("terminate() is idempotent", async () => {
  const rpc = makeRpc({});
  rpc.terminate();
  rpc.terminate(); // must not throw
  assert.equal(rpc.target.terminated, true);
});
