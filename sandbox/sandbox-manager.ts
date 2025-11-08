import * as ts from "typescript";

export interface ExecuteMessage {
  type: "execute";
  code: string;
  id: string;
  contentType?: string;
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

    let transpiledCode: string;
    try {
      transpiledCode = transpileToJavaScript(code);
    } catch (error) {
      return Promise.resolve({
        success: false,
        error: error instanceof Error ? error.message : "Failed to transpile TypeScript code",
      });
    }

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
        code: transpiledCode,
        id: executionId,
        contentType: "application/javascript",
      } as ExecuteMessage);
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
        const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
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
