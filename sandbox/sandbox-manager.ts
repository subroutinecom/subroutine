import type { SandboxIntegrationPayload } from "./types.ts";
import type { ExecuteMessage } from "./worker.ts";

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
}

export class SandboxManager {
  private readonly defaultTimeout: number;

  constructor(defaultTimeout: number = 60000) {
    this.defaultTimeout = defaultTimeout;
  }

  executeCode(
    code: string,
    options?: { integrations?: SandboxIntegrationPayload[]; timeoutMs?: number }
  ): Promise<ExecutionResult> {
    const timeout = options?.timeoutMs ?? this.defaultTimeout;
    const executionId = crypto.randomUUID();

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

    const channel = new MessageChannel();

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
        });
      }, timeout);

      const checkAndExecute = () => {
        if (integrationProxyReady && executionReady) {
          const elapsed = Date.now() - startTime;
          console.log(`[SandboxManager] Both workers ready after ${elapsed}ms, starting execution`);
          // Both workers are ready, send execution message
          executionWorker.postMessage({
            type: "execute",
            code,
            id: executionId,
            contentType: "application/typescript",
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
          });
        } else if (event.data.type === "error") {
          console.log(`[SandboxManager] Execution failed after ${elapsed}ms: ${event.data.error}`);
          clearTimeout(timeoutId);
          executionWorker.terminate();
          integrationProxyWorker.terminate();
          resolve({
            success: false,
            error: event.data.error,
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
        });
      };

      integrationProxyWorker.onerror = (error) => {
        clearTimeout(timeoutId);
        executionWorker.terminate();
        integrationProxyWorker.terminate();
        resolve({
          success: false,
          error: `Integration proxy worker failed: ${error.message || "Unknown error"}`,
        });
      };

      integrationProxyWorker.postMessage(
        {
          type: "connect",
          integrations: options?.integrations ?? [],
        },
        [channel.port2]
      );
      executionWorker.postMessage({ type: "connect" }, [channel.port1]);
    });
  }
}
