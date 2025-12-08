import { LRUCache } from "lru-cache";
import type { CallResponse } from "./remoteProxy.ts";

export class RunCacheManager {
  // LRUCache<RunId, Map>
  private static readonly MAX_RUNS = 50;
  private static readonly RUN_TTL = 1000 * 60 * 5; // 5 minutes

  private static caches = new LRUCache<string, Map<string, CallResponse>>({
    max: RunCacheManager.MAX_RUNS,
    ttl: RunCacheManager.RUN_TTL,
  });

  private static getCache(runId: string): Map<string, CallResponse> {
    console.log("Getting cache container for runId:", runId);
    let cache = this.caches.get(runId);
    if (!cache) {
      cache = new Map<string, CallResponse>();
      this.caches.set(runId, cache);
    }
    return cache;
  }

  static get(runId: string, key: string): CallResponse | undefined {
    console.log("Getting cache for runId:", runId, "key:", key);
    return this.getCache(runId).get(key);
  }

  static set(runId: string, key: string, value: CallResponse): void {
    console.log("Setting cache for runId:", runId, "key:", key);
    this.getCache(runId).set(key, value);
  }

  static clear(runId: string): void {
    this.caches.delete(runId);
  }
}
