import * as ts from "typescript";

export interface ExecuteMessage {
  type: "execute";
  code: string;
  id: string;
  contentType?: string;
}

export interface ResultMessage {
  type: "result" | "error" | "execution_ready";
  id?: string;
  data?: unknown;
  error?: string;
}

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export class SandboxManager {
  private readonly timeout: number;

  constructor(timeout: number = 5000) {
    this.timeout = timeout;
  }

  executeCode(code: string): Promise<ExecutionResult> {
    const executionId = crypto.randomUUID();

    let transpiledCode: string;
    try {
      transpiledCode = transpileToJavaScript(code);
    } catch (error) {
      return Promise.resolve({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to transpile TypeScript code",
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
            read: false,
            write: false,
            ffi: false,
            sys: false,
            run: false,
            env: false,
            net: false,
          },
        },
      },
    );

    // Create execution worker
    const executionWorker = new Worker(
      new URL(`./worker.ts`, import.meta.url).href,
      {
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
      },
    );

    // Create MessageChannel to connect the two workers
    const channel = new MessageChannel();

    return new Promise<ExecutionResult>((resolve) => {
      let integrationProxyReady = false;
      let executionReady = false;

      const timeoutId = setTimeout(() => {
        executionWorker.terminate();
        integrationProxyWorker.terminate();
        resolve({
          success: false,
          error: "Execution timed out after 5 seconds",
        });
      }, this.timeout);

      const checkAndExecute = () => {
        if (integrationProxyReady && executionReady) {
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
          integrationProxyReady = true;
          checkAndExecute();
        }
      };

      // Listen for execution results from execution worker
      executionWorker.onmessage = (event: MessageEvent<ResultMessage>) => {
        const { type, data, error } = event.data;

        if (type === "execution_ready") {
          executionReady = true;
          checkAndExecute();
        } else if (type === "result") {
          clearTimeout(timeoutId);
          executionWorker.terminate();
          integrationProxyWorker.terminate();
          resolve({
            success: true,
            result: data,
          });
        } else if (type === "error") {
          clearTimeout(timeoutId);
          executionWorker.terminate();
          integrationProxyWorker.terminate();
          resolve({
            success: false,
            error,
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

      // Connect the workers via MessageChannel
      // Send port2 to integration proxy worker, port1 to execution worker
      integrationProxyWorker.postMessage({ type: "connect" }, [channel.port2]);
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
          diagnostic.start,
        );
        return `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
      }
      return message;
    })
    .join("\n");
};

const flattenDiagnosticMessage = (
  message: string | ts.DiagnosticMessageChain,
): string => {
  if (typeof message === "string") {
    return message;
  }

  const nextMessages =
    message.next?.map((entry) => flattenDiagnosticMessage(entry)) ?? [];
  return [message.messageText, ...nextMessages].join("\n");
};
