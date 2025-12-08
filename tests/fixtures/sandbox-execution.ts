// Deno lints: strict

export interface TestResponse {
  status: number;
  data: string;
}

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  code?: string;
}

const MOCK_HEADERS: Record<string, string> = {
  "x-use-mock": "true",
};

function makeRequest(
  options: {
    hostname: string;
    port?: number;
    path: string;
    method?: string;
    headers?: HeadersInit;
  },
  data?: string
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(`http://${options.hostname}`);
    if (options.port) {
      url.port = options.port.toString();
    }
    url.pathname = options.path;

    const req = new Request(url, {
      method: options.method || "GET",
      headers: options.headers,
      body: data,
    });

    fetch(req)
      .then(async (res) => {
        const body = await res.text();
        resolve({ status: res.status, data: body });
      })
      .catch((error) => {
        reject(error);
      });
  });
}

export interface ExecuteOptions {
  inputs?: Record<string, unknown>;
  integrations?: unknown[];
  runId?: string;
}

export async function executeTypescript(
  code: string,
  options: ExecuteOptions = {}
): Promise<{ status: number; result: ExecutionResult }> {
  // Prepend zod import to the code
  const fullCode = `import { z } from "zod";\n${code}`;

  const response = await makeRequest(
    {
      hostname: "sandbox.subroutine.internal",
      path: "/test/executeTypescript",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({
      code: fullCode,
      inputs: options.inputs,
      integrations: options.integrations,
      runId: options.runId,
    })
  );

  return {
    status: response.status,
    result: JSON.parse(response.data),
  };
}
