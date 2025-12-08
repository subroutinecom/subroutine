import { LRUCache } from "lru-cache";
import type { CallResponse } from "./remoteProxy.ts";

export class RunCacheManager {
  // Map<RunId, LRUCache>
  private static caches = new Map<string, LRUCache<string, CallResponse>>();
  private static readonly DEFAULT_TTL = 1000 * 60 * 5; // 5 minutes
  private static readonly MAX_SIZE = 50; // Items per run

  private static getCache(runId: string): LRUCache<string, CallResponse> {
    console.log("Getting cache container for runId:", runId);
    if (!this.caches.has(runId)) {
      this.caches.set(
        runId,
        new LRUCache({
          max: this.MAX_SIZE,
          ttl: this.DEFAULT_TTL,
        })
      );
    }
    return this.caches.get(runId)!;
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
