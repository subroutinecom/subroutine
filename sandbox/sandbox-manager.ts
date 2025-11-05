export interface ExecuteMessage {
  type: "execute";
  code: string;
  id: string;
}

export interface ResultMessage {
  type: "result" | "error";
  id: string;
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

    const worker = new Worker(new URL(`./worker.ts`, import.meta.url).href, {
      type: "module",
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

    return new Promise<ExecutionResult>((resolve) => {
      const timeoutId = setTimeout(() => {
        worker.terminate();
        resolve({
          success: false,
          error: "Execution timed out after 5 seconds",
        });
      }, this.timeout);

      worker.onmessage = (event: MessageEvent<ResultMessage>) => {
        clearTimeout(timeoutId);
        worker.terminate();

        const { type, data, error } = event.data;

        if (type === "result") {
          resolve({
            success: true,
            result: data,
          });
        } else if (type === "error") {
          resolve({
            success: false,
            error,
          });
        }
      };

      worker.onerror = (error) => {
        clearTimeout(timeoutId);
        worker.terminate();
        resolve({
          success: false,
          error: error.message || "Worker execution failed",
        });
      };

      worker.postMessage({
        type: "execute",
        code,
        id: executionId,
      } as ExecuteMessage);
    });
  }
}
