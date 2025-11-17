import { createWorkerClientFromInlineSource, Remote } from "../remote_proxy";

// Minimal service interfaces used by tests and sandboxes
export interface GmailLabelsAPI {
  list(input: { userId: string }): Promise<{ labels: string[] }>;
}
export interface GmailAPI {
  labels: GmailLabelsAPI;
}

export interface S3API {
  listBuckets(): Promise<{ buckets: string[] }>;
}

export interface GithubAPI {
  me(): Promise<{ login: string }>;
}

export interface SandboxRoot {
  getGmail(): Promise<GmailAPI>;
  getS3(): Promise<S3API>;
  getGithub(): Promise<GithubAPI>;
}

export const getSandboxClient = <Root extends object = SandboxRoot>(): Remote<Root> => {
  const source = `
    const isFunction = (v) => typeof v === 'function';
    const genId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

    const INSTANCE_PREFIX = '@@instance';
    const instances = new Map();
    const providers = new Map();

    const registerSingleton = (name, factory) => {
      providers.set(name, { factory, singleton: true, instanceId: undefined });
    };

    const handle = async (req) => {
      if (req.action !== 'call') {
        return { id: req.id, ok: false, error: { name: 'BadRequest', message: 'Unsupported action' } };
      }
      try {
        const { path, args } = req;
        let startIndex = 0;
        let ctx = undefined;
        if (path[0] === INSTANCE_PREFIX) {
          const instanceId = path[1];
          if (!instances.has(instanceId)) throw new Error('Unknown instance: ' + instanceId);
          ctx = instances.get(instanceId);
          startIndex = 2;
        } else {
          // root call, treat as provider invocation
          const rootKey = path[path.length - 1];
          const entry = providers.get(rootKey);
          if (!entry) throw new Error('No provider for ' + rootKey);
          if (entry.singleton && entry.instanceId && instances.has(entry.instanceId)) {
            return { id: req.id, ok: true, result: { __remote_instance__: entry.instanceId } };
          }
          const awaited = await Promise.resolve(entry.factory(...args));
          if (typeof awaited !== 'object' || awaited === null) {
            throw new Error('Provider ' + rootKey + ' did not return an object');
          }
          const newId = genId();
          instances.set(newId, awaited);
          if (entry.singleton) entry.instanceId = newId;
          return { id: req.id, ok: true, result: { __remote_instance__: newId } };
        }

        for (let i = startIndex; i < path.length - 1; i++) {
          const key = path[i];
          if (typeof ctx !== 'object' || ctx === null) throw new Error('Invalid path seg ' + key);
          ctx = ctx[key];
        }
        const leafKey = path[path.length - 1];
        if (typeof ctx !== 'object' || ctx === null) throw new Error('Invalid call target for ' + leafKey);
        const fn = ctx[leafKey];
        if (!isFunction(fn)) throw new Error('Target at ' + leafKey + ' is not callable');
        const result = fn.apply(ctx, [...args]);
        const awaited = result instanceof Promise ? await result : result;
        const isObj = typeof awaited === 'object' && awaited !== null;
        const hasCallable = isObj && Object.values(awaited).some(isFunction);
        if (hasCallable) {
          const newId = genId();
          instances.set(newId, awaited);
          return { id: req.id, ok: true, result: { __remote_instance__: newId } };
        }
        return { id: req.id, ok: true, result: awaited };
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        return { id: req.id, ok: false, error: { name: err.name, message: err.message } };
      }
    };

    // Providers
    const labelsByUser = { me: ['INBOX', 'STARRED'] };
    registerSingleton('getGmail', async () => ({
      labels: { list: async ({ userId }) => ({ labels: labelsByUser[userId] ?? [] }) },
    }));
    registerSingleton('getS3', async () => ({
      listBuckets: async () => ({ buckets: ['photos', 'backups'] }),
    }));
    registerSingleton('getGithub', async () => ({
      me: async () => ({ login: 'octocat' }),
    }));

    self.onmessage = async (ev) => {
      const msg = ev.data;
      if (!msg || msg.kind !== 'rpc') return;
      const req = JSON.parse(JSON.stringify(msg.payload));
      const res = await handle(req);
      const wire = { kind: 'rpc_result', payload: JSON.parse(JSON.stringify(res)) };
      self.postMessage(wire);
    };
  `;
  const client = createWorkerClientFromInlineSource<Root>(source);
  return client.getProxy<Root>();
};
