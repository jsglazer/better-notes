import {
  RpcRequest,
  WorkerHandlers,
  buildResponse,
  isRpcFrame,
} from "../../utils/workerProtocol";

/**
 * Worker-side counterpart to {@link WorkerRpc} — the replacement for the
 * toolkit's worker-side `MessageHelper`.
 *
 * Registers ONE message listener that dispatches RPC requests to `handlers` and
 * posts back a typed response (resolving the caller's promise, or rejecting it
 * with the handler's error message). A built-in `_ping` answers readiness
 * checks. There is deliberately no self-close path: the worker is killed from
 * the main side via `worker.terminate()`, so nothing here can leak.
 *
 * Lives under `extras/lib/` (not directly in `extras/`) so the build's
 * `src/extras/*.*` worker-entry glob doesn't emit it as its own bundle; it is
 * bundled into each worker that imports it.
 */
export function serveWorker(handlers: WorkerHandlers): void {
  const all: WorkerHandlers = { _ping: () => true, ...handlers };
  const scope = self as unknown as {
    addEventListener: (t: string, l: (e: MessageEvent) => void) => void;
    postMessage: (m: unknown) => void;
  };
  scope.addEventListener("message", async (e: MessageEvent) => {
    const req = e.data as RpcRequest;
    if (!isRpcFrame(req)) {
      return;
    }
    const fn = all[req.name];
    if (typeof fn !== "function") {
      scope.postMessage(
        buildResponse(req.id, {
          ok: false,
          error: `no handler '${req.name}'`,
        }),
      );
      return;
    }
    try {
      const result = await fn(...(req.args || []));
      scope.postMessage(buildResponse(req.id, { ok: true, result }));
    } catch (err) {
      scope.postMessage(
        buildResponse(req.id, {
          ok: false,
          error: String((err as { message?: string })?.message ?? err),
        }),
      );
    }
  });
}
