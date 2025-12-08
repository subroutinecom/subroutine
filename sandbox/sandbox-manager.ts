import { createHash } from "node:crypto";
import { RunCacheManager } from "./memory-cache.ts";
import { RemoteProxyServer, type WireMessage } from "./remoteProxy.ts";
import { applyTransforms } from "./transforms/index.ts";
import type { SandboxIntegrationPayload } from "./types.ts";
import type { ExecuteMessage } from "./worker.ts";

const MAX_CACHE_SIZE_BYTES = 5 * 1024 * 1024;

type ExecutionWorkerMessage =
  | {
      type: "execution_ready";
    }
  | {
      type: "result";
      data: unknown;
    }
  | {
      type: "error";
      error?: string;
    };

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  code?: string;
}

export class SandboxManager {
  private readonly defaultTimeout: number;

  constructor(defaultTimeout: number = 60000) {
    this.defaultTimeout = defaultTimeout;
  }

  async executeCode(
    code: string,
    options?: {
      integrations?: SandboxIntegrationPayload[];
      timeoutMs?: number;
      inputs?: Record<string, unknown>;
      runId?: string;
    }
  ): Promise<ExecutionResult> {
    const timeout = options?.timeoutMs ?? this.defaultTimeout;
    const executionId = crypto.randomUUID();

    // Apply code transformations (e.g. logging)
    const transformedCode = await applyTransforms(code);

    // Create integration proxy worker for integrations
    const integrationProxyWorker = new Worker(
      new URL(`./integrationProxyWorker`, import.meta.url).href,
      {
        type: "module",
        name: "integration-proxy-worker",
        deno: {
          permissions: {
            read: true,
            write: true,
            ffi: false,
            sys: false,
            run: false,
            env: true,
            net: true,
          },
        },
      }
    );

    // Create execution worker
    const executionWorker = new Worker(new URL(`./worker.ts`, import.meta.url).href, {
      type: "module",
      name: "execution-worker",
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
    });

    const integrationChannel = new MessageChannel();
    const executionChannel = new MessageChannel();

    // Setup proxy handling in the main process
    const executionPort = executionChannel.port2;
    const integrationPort = integrationChannel.port1;

    // Map to track request context for caching responses
    const pendingRequests = new Map<
      string,
      {
        runId?: string;
        latestMarkerId?: string;
        pmarkerCounter?: number;
        canonicalPath: readonly string[];
        args: readonly unknown[];
      }
    >();

    executionPort.onmessage = (ev: MessageEvent<WireMessage>) => {
      const wireMsg = ev.data;
      if (!wireMsg || wireMsg.kind !== "rpc") return;

      (async () => {
        const req = wireMsg.payload;
        const { runId, latestMarkerId, pmarkerCounter } = req.metadata || {};

        // Canonicalize path for caching (remove non-deterministic instance ID)
        let canonicalPath = req.path;
        if (canonicalPath[0] === RemoteProxyServer.INSTANCE_PREFIX && canonicalPath.length >= 2) {
          canonicalPath = canonicalPath.slice(2);
        }

        if (
          runId &&
          latestMarkerId &&
          typeof runId === "string" &&
          typeof latestMarkerId === "string" &&
          typeof pmarkerCounter === "number"
        ) {
          const hashInput = JSON.stringify({
            path: canonicalPath,
            args: req.args,
            counter: pmarkerCounter,
          });
          const argsHash = createHash("sha256").update(hashInput).digest("hex");
          const cacheKey = `${latestMarkerId}:${argsHash}`;

          const cached = RunCacheManager.get(runId, cacheKey);
          if (cached) {
            console.log(`[SandboxManager] Cache HIT for ${cacheKey}`);
            const wire: WireMessage = {
              kind: "rpc_result",
              payload: { ...cached, id: req.id },
            };
            executionPort.postMessage(wire);
            return;
          }
        }

        // Store metadata for response caching
        pendingRequests.set(req.id, {
          runId: typeof runId === "string" ? runId : undefined,
          latestMarkerId: typeof latestMarkerId === "string" ? latestMarkerId : undefined,
          pmarkerCounter: typeof pmarkerCounter === "number" ? pmarkerCounter : undefined,
          canonicalPath,
          args: req.args,
        });

        // Forward to integration proxy
        integrationPort.postMessage(wireMsg);
      })();
    };

    integrationPort.onmessage = (ev: MessageEvent<WireMessage>) => {
      const wireMsg = ev.data;
      if (!wireMsg || wireMsg.kind !== "rpc_result") return;

      const res = wireMsg.payload;
      const meta = pendingRequests.get(res.id);

      if (meta) {
        pendingRequests.delete(res.id);
        const { runId, latestMarkerId, pmarkerCounter, canonicalPath, args } = meta;

        if (runId && latestMarkerId && typeof pmarkerCounter === "number" && res.ok) {
          const hashInput = JSON.stringify({ path: canonicalPath, args, counter: pmarkerCounter });
          const argsHash = createHash("sha256").update(hashInput).digest("hex");
          const cacheKey = `${latestMarkerId}:${argsHash}`;

          try {
            const value = JSON.stringify(res);
            if (new TextEncoder().encode(value).length <= MAX_CACHE_SIZE_BYTES) {
              RunCacheManager.set(runId, cacheKey, res);
            }
          } catch (e) {
            console.warn(`[SandboxManager] Cache write error:`, e);
          }
        }
      }

      // Forward response to execution worker
      executionPort.postMessage(wireMsg);
    };

    return new Promise<ExecutionResult>((resolve) => {
      let integrationProxyReady = false;
      let executionReady = false;

      const startTime = Date.now();
      const timeoutId = setTimeout(() => {
        const elapsed = Date.now() - startTime;
        console.log(
          `[SandboxManager] Execution timed out after ${elapsed}ms (limit: ${timeout}ms)`
        );
        executionWorker.terminate();
        integrationProxyWorker.terminate();
        resolve({
          success: false,
          error: `Execution timed out after ${Math.round(timeout / 1000)} seconds`,
          code: transformedCode,
        });
      }, timeout);

      const checkAndExecute = () => {
        if (integrationProxyReady && executionReady) {
          const elapsed = Date.now() - startTime;
          console.log(`[SandboxManager] Both workers ready after ${elapsed}ms, starting execution`);
          // Both workers are ready, send execution message
          executionWorker.postMessage({
            type: "execute",
            code: transformedCode,
            id: executionId,
            runId: options?.runId,
            contentType: "application/typescript",
            inputs: options?.inputs,
          } as ExecuteMessage);
        }
      };

      // Listen for integration proxy worker ready signal
      integrationProxyWorker.onmessage = (event: MessageEvent) => {
        if (event.data?.type === "integration_proxy_ready") {
          const elapsed = Date.now() - startTime;
          console.log(`[SandboxManager] Integration proxy ready after ${elapsed}ms`);
          integrationProxyReady = true;
          checkAndExecute();
        }
      };

      // Listen for execution results from execution worker
      executionWorker.onmessage = (event: MessageEvent<ExecutionWorkerMessage>) => {
        const elapsed = Date.now() - startTime;
        if (event.data.type === "execution_ready") {
          console.log(`[SandboxManager] Execution worker ready after ${elapsed}ms`);
          executionReady = true;
          checkAndExecute();
        } else if (event.data.type === "result") {
          console.log(`[SandboxManager] Execution completed successfully after ${elapsed}ms`);
          clearTimeout(timeoutId);
          executionWorker.terminate();
          integrationProxyWorker.terminate();
          resolve({
            success: true,
            result: event.data.data,
            code: transformedCode,
          });
        } else if (event.data.type === "error") {
          console.log(`[SandboxManager] Execution failed after ${elapsed}ms: ${event.data.error}`);
          clearTimeout(timeoutId);
          executionWorker.terminate();
          integrationProxyWorker.terminate();
          resolve({
            success: false,
            error: event.data.error,
            code: transformedCode,
          });
        }
      };

      executionWorker.onerror = (error) => {
        clearTimeout(timeoutId);
        executionWorker.terminate();
        integrationProxyWorker.terminate();
        resolve({
          success: false,
          error: error.message || "Worker execution failed",
          code: transformedCode,
        });
      };

      integrationProxyWorker.onerror = (error) => {
        clearTimeout(timeoutId);
        executionWorker.terminate();
        integrationProxyWorker.terminate();
        resolve({
          success: false,
          error: `Integration proxy worker failed: ${error.message || "Unknown error"}`,
          code: transformedCode,
        });
      };

      integrationProxyWorker.postMessage(
        {
          type: "connect",
          integrations: options?.integrations ?? [],
        },
        [integrationChannel.port2]
      );
      executionWorker.postMessage({ type: "connect" }, [executionChannel.port1]);
    });
  }
}
