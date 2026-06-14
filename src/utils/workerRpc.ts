import {
  RPC_KIND,
  RpcRequest,
  RpcResponse,
  RpcProxy,
  WorkerHandlers,
  isRpcFrame,
} from "./workerProtocol";

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * A thin, owned RPC channel over a Web/ChromeWorker — the replacement for the
 * toolkit's `MessageHelper`.
 *
 * The key difference is lifecycle ownership: {@link terminate} rejects every
 * in-flight call, detaches the message listener, AND calls `worker.terminate()`.
 * The toolkit's helper did only the first two, so a live worker (holding a
 * script loaded from the plugin's `chrome://` registration) outlived shutdown
 * and made the active plugin un-removable until a restart. Here a worker can
 * never outlive the channel.
 *
 * `proxy.fn(...args)` posts an RPC request and resolves with the handler's
 * awaited return value; handler exceptions reject the promise, and calls time
 * out so a wedged worker can't hang a caller forever.
 */
export class WorkerRpc<H extends WorkerHandlers> {
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private messageListener: (e: MessageEvent) => void;
  private errorListener: (e: unknown) => void;
  private alive = true;
  private timeoutMs: number;
  readonly name: string;
  readonly proxy: RpcProxy<H>;

  constructor(url: string, options: { name: string; timeoutMs?: number }) {
    this.name = options.name;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.worker = new Worker(url, { name: options.name });
    this.messageListener = (e: MessageEvent) => this.onMessage(e);
    this.errorListener = (e: unknown) => this.onError(e);
    this.worker.addEventListener(
      "message",
      this.messageListener as unknown as EventListener,
    );
    this.worker.addEventListener("error", this.errorListener as EventListener);
    this.proxy = new Proxy({} as RpcProxy<H>, {
      get:
        (_t, prop: string) =>
        (...args: unknown[]) =>
          this.call(prop, args),
    });
  }

  /** Invoke a worker handler by name; resolves with its awaited return value. */
  call(name: string, args: unknown[]): Promise<unknown> {
    if (!this.alive) {
      return Promise.reject(
        new Error(`worker '${this.name}' terminated; call '${name}' rejected`),
      );
    }
    const id = ++this.seq;
    const req: RpcRequest = { kind: RPC_KIND, id, name, args };
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`worker '${this.name}' call '${name}' timed out`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage(req);
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  private onMessage(e: MessageEvent): void {
    const msg = e.data as RpcResponse;
    if (!isRpcFrame(msg)) {
      return;
    }
    const p = this.pending.get(msg.id);
    if (!p) {
      return;
    }
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    if (msg.ok) {
      p.resolve(msg.result);
    } else {
      p.reject(new Error(msg.error || `worker '${this.name}' error`));
    }
  }

  private onError(e: unknown): void {
    // A worker-level error (e.g. an uncaught throw / load failure) can't be tied
    // to one call — fail every waiter so nothing hangs.
    const err =
      (e as ErrorEvent)?.message != null
        ? new Error((e as ErrorEvent).message)
        : e;
    this.rejectAll(err);
  }

  private rejectAll(reason: unknown): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(reason);
      this.pending.delete(id);
    }
  }

  /** Round-trip readiness check; resolves once the worker answers. */
  async ready(): Promise<void> {
    await this.call("_ping", []);
  }

  /** The underlying worker (rarely needed; teardown goes through terminate). */
  get target(): Worker {
    return this.worker;
  }

  /**
   * Fully tear down: reject in-flight calls, detach listeners, terminate the
   * worker. Idempotent. After this the channel rejects further calls.
   */
  terminate(): void {
    if (!this.alive) {
      return;
    }
    this.alive = false;
    this.rejectAll(new Error(`worker '${this.name}' terminated`));
    try {
      this.worker.removeEventListener(
        "message",
        this.messageListener as unknown as EventListener,
      );
      this.worker.removeEventListener(
        "error",
        this.errorListener as EventListener,
      );
    } catch (e) {
      // listener already detached
    }
    try {
      this.worker.terminate();
    } catch (e) {
      // worker already gone
    }
  }
}
