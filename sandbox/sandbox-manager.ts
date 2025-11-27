import * as ts from "typescript";
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

    let transpiledCode: string;
    try {
      transpiledCode = transpileToJavaScript(code);
    } catch (error) {
      return Promise.resolve({
        success: false,
        error: error instanceof Error ? error.message : "Failed to transpile TypeScript code",
      });
    }

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
            code: transpiledCode,
            id: executionId,
            contentType: "application/javascript",
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

const transpileToJavaScript = (code: string): string => {
  const result = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    reportDiagnostics: true,
  });

  if (result.diagnostics && result.diagnostics.length > 0) {
    const details = formatDiagnostics(result.diagnostics).trim();
    throw new Error(`The provided code could not be parsed: ${details}`);
  }

  if (!result.outputText) {
    throw new Error("TypeScript transpilation produced no output");
  }

  return result.outputText;
};

const formatDiagnostics = (diagnostics: readonly ts.Diagnostic[]): string => {
  return diagnostics
    .map((diagnostic) => {
      const message = flattenDiagnosticMessage(diagnostic.messageText);
      if (diagnostic.file && typeof diagnostic.start === "number") {
        const { line, character } = ts.getLineAndCharacterOfPosition(
          diagnostic.file,
          diagnostic.start
        );
        return `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
      }
      return message;
    })
    .join("\n");
};

const flattenDiagnosticMessage = (message: string | ts.DiagnosticMessageChain): string => {
  if (typeof message === "string") {
    return message;
  }

  const nextMessages = message.next?.map((entry) => flattenDiagnosticMessage(entry)) ?? [];
  return [message.messageText, ...nextMessages].join("\n");
};
