/**
 * Shared wire protocol for the plugin's owned worker RPC layer.
 *
 * Replaces zotero-plugin-toolkit's `MessageHelper`. The toolkit's helper never
 * terminated its worker (its `destroy()` only detached the message listener),
 * so the relation/parsing/convert ChromeWorkers outlived shutdown and blocked
 * plugin removal until a restart. This layer owns the worker lifecycle end to
 * end — see {@link WorkerRpc} (main side) and `serveWorker` (worker side).
 *
 * Pure module: only types + one constant, no Zotero/DOM access — so it can be
 * imported by both the main bundle and the worker bundles, and unit-tested.
 */

/** Discriminator so RPC frames are distinguishable from any other postMessage. */
export const RPC_KIND = "__bn_rpc__";

export interface RpcRequest {
  kind: typeof RPC_KIND;
  id: number;
  name: string;
  args: unknown[];
}

export interface RpcResponse {
  kind: typeof RPC_KIND;
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkerHandlers = Record<string, (...args: any[]) => any>;

/** Typed proxy: each handler becomes an async method returning its awaited result. */
export type RpcProxy<H extends WorkerHandlers> = {
  [K in keyof H]: (
    ...args: Parameters<H[K]>
  ) => Promise<Awaited<ReturnType<H[K]>>>;
};

/** Build the response frame for a handled request (success or failure). */
export function buildResponse(
  id: number,
  outcome: { ok: true; result: unknown } | { ok: false; error: string },
): RpcResponse {
  return outcome.ok
    ? { kind: RPC_KIND, id, ok: true, result: outcome.result }
    : { kind: RPC_KIND, id, ok: false, error: outcome.error };
}

/** Type guard for an inbound RPC frame (request or response). */
export function isRpcFrame(
  data: unknown,
): data is { kind: typeof RPC_KIND; id: number } {
  return (
    !!data &&
    typeof data === "object" &&
    (data as { kind?: unknown }).kind === RPC_KIND &&
    typeof (data as { id?: unknown }).id === "number"
  );
}
