export type Path = readonly string[];

export type CallRequest = {
  readonly id: string;
  readonly action: "call";
  readonly path: Path;
  readonly args: readonly unknown[];
  readonly metadata?: {
    runId?: string;
    latestMarkerId?: string;
    [key: string]: unknown;
  };
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

export type CallHook = (path: Path, args: readonly unknown[]) => void;

export interface RemoteProxyOptions {
  onCall?: CallHook;
}

export class RemoteProxyServer<T extends object = object> {
  #target: T;
  #instances: Map<string, object> = new Map();
  #providers: Map<string, ProviderEntry> = new Map();
  #onCall?: CallHook;
  static readonly INSTANCE_PREFIX = "@@instance" as const;

  constructor(target?: T, options?: RemoteProxyOptions) {
    // When no implementation is provided, use an empty object and rely on providers
    this.#target = target ?? ({} as T);
    this.#onCall = options?.onCall;
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

      if (this.#onCall) {
        this.#onCall(path, args);
      }

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
  #metadataGetter?: () => Record<string, unknown>;

  constructor(transport: Transport, metadataGetter?: () => Record<string, unknown>) {
    this.#transport = transport;
    this.#metadataGetter = metadataGetter;
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
          const metadata = this.#metadataGetter ? this.#metadataGetter() : undefined;
          const req: CallRequest = { id, action: "call", path, args: [...argList], metadata };
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
            if (cached) {
              console.log("Cache hit for instance:", instanceId);
              return cached;
            }
            const inst = makeInstance(instanceId);
            if (!cached) {
              this.#instanceCache.set(instanceId, inst);
            }
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
            const metadata = this.#metadataGetter ? this.#metadataGetter() : undefined;
            const req: CallRequest = { id, action: "call", path, args: [...argList], metadata };
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
              if (!cached) {
                this.#instanceCache.set(nestedId, nested);
              }
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

// MessagePort-based transport for MessageChannel communication
export type WireMessage =
  | { kind: "rpc"; payload: CallRequest }
  | {
      kind: "rpc_result";
      payload: CallResponse;
    };
export class MessagePortTransport implements Transport {
  #port: MessagePort;
  #pending = new Map<string, (res: CallResponse) => void>();

  constructor(port: MessagePort) {
    this.#port = port;
    this.#port.onmessage = (ev: MessageEvent<WireMessage>) => {
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

  request(req: CallRequest): Promise<CallResponse> {
    // Simulate JSON wire on send
    const wireReq = JSON.stringify(req);
    const safeReq = JSON.parse(wireReq) as CallRequest;
    const p = new Promise<CallResponse>((resolve) => {
      this.#pending.set(safeReq.id, resolve);
    });
    const msg: WireMessage = { kind: "rpc", payload: safeReq };
    this.#port.postMessage(msg);
    return p;
  }
}

export const createMessagePortClient = <T extends object>(
  port: MessagePort,
  metadataGetter?: () => Record<string, unknown>
): RemoteProxyClient<T> => {
  const transport = new MessagePortTransport(port);
  return new RemoteProxyClient<T>(transport, metadataGetter);
};
