import { createClient } from "redis";
import type { CallResponse } from "./remoteProxy.ts";

const REDIS_HOST = Deno.env.get("REDIS_HOST") || "redis.subroutine.internal";
const REDIS_URL = `redis://${REDIS_HOST}:6379`;

export class RunCacheManager {
  private static readonly RUN_TTL = 60 * 5; // 5 minutes in seconds

  private static client = createClient({
    url: REDIS_URL,
  });

  private static isConnected = false;

  private static async ensureConnection() {
    if (!this.isConnected) {
      this.client.on("error", (err: unknown) => console.error("Redis Client Error", err));
      await this.client.connect();
      this.isConnected = true;
    }
  }

  static async get(runId: string, key: string): Promise<CallResponse | undefined> {
    await this.ensureConnection();
    console.log("Getting cache for runId:", runId, "key:", key);
    const value = await this.client.hGet(`run-cache:${runId}`, key);
    console.log(`run-cache:${runId}`, key, value);
    if (!value) return undefined;
    try {
      return JSON.parse(value);
    } catch (e) {
      console.error("Failed to parse cache value", e);
      return undefined;
    }
  }

  static async set(runId: string, key: string, value: CallResponse): Promise<void> {
    await this.ensureConnection();
    console.log("Setting cache for runId:", runId, "key:", key);
    const redisKey = `run-cache:${runId}`;
    await this.client.hSet(redisKey, key, JSON.stringify(value));
    await this.client.expire(redisKey, this.RUN_TTL);
  }

  static async clear(runId: string): Promise<void> {
    await this.ensureConnection();
    await this.client.del(`run-cache:${runId}`);
  }
}
