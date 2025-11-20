export type Path = readonly string[];

export type CallRequest = {
  readonly id: string;
  readonly action: "call";
  readonly path: Path;
  readonly args: readonly unknown[];
};

export type CallResponse =
  | { readonly id: string; readonly ok: true; readonly result: unknown }
  | {
      readonly id: string;
      readonly ok: false;
      readonly error: { readonly name: string; readonly message: string };
    };

export interface Transport {
  request: (req: CallRequest) => Promise<CallResponse>;
}

export interface Handler {
  (req: CallRequest): Promise<CallResponse>;
}

type RemoteReturn<R> = R extends object ? Remote<R> : R;

export type Remote<T> = {
  readonly [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<RemoteReturn<Awaited<R>>>
    : T[K] extends object
      ? Remote<T[K]>
      : unknown;
};

const isFunction = (v: unknown): v is (...args: unknown[]) => unknown => typeof v === "function";

const genId = () => crypto.randomUUID();

type ProviderEntry = {
  readonly factory: (...args: readonly unknown[]) => Promise<object> | object;
  readonly singleton: boolean;
  instanceId?: string;
};

export class RemoteProxyServer<T extends object = object> {
  #target: T;
  #instances: Map<string, object> = new Map();
  #providers: Map<string, ProviderEntry> = new Map();
  static readonly INSTANCE_PREFIX = "@@instance" as const;

  constructor(target?: T) {
    // When no implementation is provided, use an empty object and rely on providers
    this.#target = target ?? ({} as T);
  }

  register(
    name: string,
    provider: (...args: readonly unknown[]) => Promise<object> | object
  ): void {
    this.#providers.set(name, { factory: provider, singleton: false });
  }

  registerSingleton(
    name: string,
    provider: (...args: readonly unknown[]) => Promise<object> | object
  ): void {
    this.#providers.set(name, { factory: provider, singleton: true });
  }

  handle: Handler = async (req) => {
    if (req.action !== "call") {
      return {
        id: req.id,
        ok: false,
        error: { name: "BadRequest", message: `Unsupported action: ${req.action}` },
      };
    }

    try {
      const { path, args } = req;

      // Determine context: root target or an existing instance
      let startIndex = 0;
      let ctx: unknown = this.#target;
      if (path[0] === RemoteProxyServer.INSTANCE_PREFIX) {
        const instanceId = path[1];
        const inst = this.#instances.get(instanceId);
        if (!inst) throw new Error(`Unknown instance: ${instanceId}`);
        ctx = inst;
        startIndex = 2;
      }

      for (let i = startIndex; i < path.length - 1; i++) {
        const key = path[i] as keyof object;
        if (typeof ctx !== "object" || ctx === null) {
          throw new Error(`Invalid path segment: ${path[i]}`);
        }
        ctx = (ctx as Record<string, unknown>)[String(key)];
      }

      const leafKey = path[path.length - 1];
      if (typeof ctx !== "object" || ctx === null) {
        throw new Error(`Invalid call target for ${leafKey}`);
      }
      const fnCandidate = (ctx as Record<string, unknown>)[leafKey];
      if (!isFunction(fnCandidate)) {
        // Lazy provider fallback if calling a root-level virtual method
        if (startIndex === 0 && this.#providers.has(leafKey)) {
          const entry = this.#providers.get(leafKey)!;
          if (entry.singleton && entry.instanceId && this.#instances.has(entry.instanceId)) {
            return { id: req.id, ok: true, result: { __remote_instance__: entry.instanceId } };
          }

          const awaited = await Promise.resolve(entry.factory(...args));
          if (typeof awaited !== "object" || awaited === null) {
            throw new Error(`Provider ${leafKey} did not return an object`);
          }
          const newId = genId();
          this.#instances.set(newId, awaited as object);
          if (entry.singleton) {
            entry.instanceId = newId;
          }
          return { id: req.id, ok: true, result: { __remote_instance__: newId } };
        }
        throw new Error(`Target at ${leafKey} is not callable`);
      }

      const result = fnCandidate.apply(ctx, [...args]);
      const awaited = result instanceof Promise ? await result : result;

      // If the result is an object with callable members, surface it as a remote instance
      const isObject = typeof awaited === "object" && awaited !== null;
      const hasCallable =
        isObject && Object.values(awaited as Record<string, unknown>).some(isFunction);
      if (hasCallable) {
        const newId = genId();
        this.#instances.set(newId, awaited as object);
        return { id: req.id, ok: true, result: { __remote_instance__: newId } };
      }

      return { id: req.id, ok: true, result: awaited };
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      return { id: req.id, ok: false, error: { name: err.name, message: err.message } };
    }
  };
}

export class RemoteProxyClient<T extends object = object> {
  #transport: Transport;
  #instanceCache: Map<string, unknown> = new Map();

  constructor(transport: Transport) {
    this.#transport = transport;
  }

  getProxy<API = T>(): Remote<API> {
    const make = (path: Path): unknown => {
      const target = () => {
        /* never called directly */
      };
      return new Proxy(target, {
        get: (_t, prop) => {
          if (prop === "then") return undefined; // avoid thenable traps
          if (typeof prop === "symbol") return undefined;
          return make([...path, String(prop)]);
        },
        apply: async (_t, _thisArg, argList) => {
          const id = genId();
          const req: CallRequest = { id, action: "call", path, args: [...argList] };
          // Enforce JSON serialization across the wire
          const wireReq = JSON.stringify(req);
          const jsonReq = JSON.parse(wireReq) as CallRequest;
          const resRaw = await this.#transport.request(jsonReq);
          const wireRes = JSON.stringify(resRaw);
          const res = JSON.parse(wireRes) as CallResponse;
          if (!res.ok) {
            const err = new Error(res.error.message);
            err.name = res.error.name;
            throw err;
          }
          const out = res.result as unknown;
          const ref = out as { __remote_instance__?: string };
          if (ref && typeof ref === "object" && typeof ref.__remote_instance__ === "string") {
            const instanceId = ref.__remote_instance__;
            const cached = this.#instanceCache.get(instanceId);
            if (cached) return cached;
            const inst = makeInstance(instanceId);
            this.#instanceCache.set(instanceId, inst);
            return inst;
          }
          return out;
        },
      });
    };

    const makeInstance = (instanceId: string): unknown => {
      const pathPrefix: Path = [RemoteProxyServer.INSTANCE_PREFIX, instanceId];
      const target = () => {
        /* never called directly */
      };
      const makeFrom = (path: Path): unknown =>
        new Proxy(target, {
          get: (_t, prop) => {
            if (prop === "then") return undefined;
            if (typeof prop === "symbol") return undefined;
            return makeFrom([...path, String(prop)]);
          },
          apply: async (_t, _thisArg, argList) => {
            const id = genId();
            const req: CallRequest = { id, action: "call", path, args: [...argList] };
            // Enforce JSON serialization across the wire
            const wireReq = JSON.stringify(req);
            const jsonReq = JSON.parse(wireReq) as CallRequest;
            const resRaw = await this.#transport.request(jsonReq);
            const wireRes = JSON.stringify(resRaw);
            const res = JSON.parse(wireRes) as CallResponse;
            if (!res.ok) {
              const err = new Error(res.error.message);
              err.name = res.error.name;
              throw err;
            }
            const out = res.result as unknown;
            const ref = out as { __remote_instance__?: string };
            if (ref && typeof ref === "object" && typeof ref.__remote_instance__ === "string") {
              const nestedId = ref.__remote_instance__;
              const cached = this.#instanceCache.get(nestedId);
              if (cached) return cached;
              const nested = makeInstance(nestedId);
              this.#instanceCache.set(nestedId, nested);
              return nested;
            }
            return out;
          },
        });
      return makeFrom(pathPrefix);
    };

    // The proxy value is structurally untyped at runtime; its static type is Remote<T>.
    return make([]) as unknown as Remote<API>;
  }
}

export const createLocalTransport = (handler: Handler): Transport => {
  const request = async (req: CallRequest): Promise<CallResponse> => {
    // Simulate JSON boundary for local transport as well
    const wire = JSON.stringify(req);
    const parsed = JSON.parse(wire) as CallRequest;
    const res = await handler(parsed);
    const wireRes = JSON.stringify(res);
    return JSON.parse(wireRes) as CallResponse;
  };
  return { request };
};

export const createLocalBridge = <T extends object>(target: T): Remote<T> => {
  const server = new RemoteProxyServer<T>(target);
  const transport = createLocalTransport(server.handle);
  const client = new RemoteProxyClient<T>(transport);
  return client.getProxy();
};

export const createLocalClient = <T extends object>(
  server: RemoteProxyServer<object>
): RemoteProxyClient<T> => {
  const transport = createLocalTransport(server.handle);
  return new RemoteProxyClient<T>(transport);
};

// Worker-based transport for cross-thread messaging
type WireMessage =
  | { kind: "rpc"; payload: CallRequest }
  | {
      kind: "rpc_result";
      payload: CallResponse;
    };

export class WorkerTransport implements Transport {
  #worker: Worker;
  #pending = new Map<string, (res: CallResponse) => void>();

  constructor(worker: Worker) {
    this.#worker = worker;
    this.#worker.onmessage = (ev: MessageEvent<WireMessage>) => {
      const msg = ev.data;
      if (!msg || msg.kind !== "rpc_result") return;
      const res = msg.payload;
      const resolve = this.#pending.get(res.id);
      if (resolve) {
        this.#pending.delete(res.id);
        // Simulate JSON wire on receive
        const wireRes = JSON.stringify(res);
        resolve(JSON.parse(wireRes) as CallResponse);
      }
    };
  }

  async request(req: CallRequest): Promise<CallResponse> {
    // Simulate JSON wire on send
    const wireReq = JSON.stringify(req);
    const safeReq = JSON.parse(wireReq) as CallRequest;
    const p = new Promise<CallResponse>((resolve) => {
      this.#pending.set(safeReq.id, resolve);
    });
    const msg: WireMessage = { kind: "rpc", payload: safeReq };
    this.#worker.postMessage(msg);
    return p;
  }
}

export const createWorkerClient = <T extends object>(
  workerScript: string | URL
): RemoteProxyClient<T> => {
  const worker = new Worker(workerScript, { type: "module", name: "remote-proxy" });
  const transport = new WorkerTransport(worker);
  return new RemoteProxyClient<T>(transport);
};

export const createWorkerClientFromPath = <T extends object>(
  workerPath: string | URL
): RemoteProxyClient<T> => {
  let url: string;
  try {
    // If absolute URL passed
    url = new URL(typeof workerPath === "string" ? workerPath : workerPath).href;
  } catch {
    // Resolve relative to this module
    url = new URL(String(workerPath), import.meta.url).href;
  }
  const worker = new Worker(url, {
    type: "module",
    name: "remote-proxy",
    // Deno-specific worker permissions, fully sandboxed
    deno: {
      permissions: {
        read: false,
        write: false,
        ffi: false,
        sys: false,
        run: false,
        env: false,
        net: false,
      },
    },
  } as unknown as WorkerOptions);
  const transport = new WorkerTransport(worker);
  return new RemoteProxyClient<T>(transport);
};

export const createWorkerClientFromInlineSource = <T extends object>(
  source: string
): RemoteProxyClient<T> => {
  const blob = new Blob([source], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, { type: "module", name: "remote-proxy" });
  const transport = new WorkerTransport(worker);
  return new RemoteProxyClient<T>(transport);
};
