// Deno lints: strict
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

const MOCK_HEADERS: Record<string, string> = {
  "x-use-mock": "true",
};

interface TestResponse {
  status: number;
  data: string;
}

interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  code?: string;
}

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

async function executeTypescript(
  code: string,
  inputs?: Record<string, unknown>,
  runId?: string
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
    JSON.stringify({ code: fullCode, inputs, runId })
  );

  return {
    status: response.status,
    result: JSON.parse(response.data),
  };
}

Deno.test("caches integration results within the same runId and pmarker", async () => {
  const code = `
    export default async function(inputs, { integrations }) {
      const ping = await integrations.getPing();
      // This call should be cached if runId is provided
      const response = await ping.ping("hello");
      return response;
    }
    `;

  const runId = `test-run-${Date.now()}`;

  // First execution
  const res1 = await executeTypescript(code, {}, runId);
  expect(res1.status, "HTTP status is 200").toBe(200);
  expect(res1.result.success, "Result should indicate success").toBe(true);
  const timestamp1 = (res1.result.result as { timestamp: number }).timestamp;

  // Small delay to ensure time passes
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Second execution - same runId
  const res2 = await executeTypescript(code, {}, runId);
  expect(res2.status, "HTTP status is 200").toBe(200);
  expect(res2.result.success, "Result should indicate success").toBe(true);
  const timestamp2 = (res2.result.result as { timestamp: number }).timestamp;

  // Timestamps should match exactly if cached
  expect(timestamp2, "Timestamps should match exactly if cached").toBe(timestamp1);
});

describe("Sandbox Caching", () => {
  it("does not cache across different runIds", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const ping = await integrations.getPing();
      const response = await ping.ping("hello");
      return response;
    }
    `;

    const runId1 = `test-run-A-${Date.now()}`;
    const runId2 = `test-run-B-${Date.now()}`;

    // First execution
    const res1 = await executeTypescript(code, {}, runId1);
    const timestamp1 = (res1.result.result as { timestamp: number }).timestamp;

    // Small delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Second execution - different runId
    const res2 = await executeTypescript(code, {}, runId2);
    const timestamp2 = (res2.result.result as { timestamp: number }).timestamp;

    // Timestamps should be different
    expect(timestamp2, "Timestamps should be different").toBeGreaterThan(timestamp1);
  });

  it("invalidates cache if code (pmarker) changes", async () => {
    // Code 1: 10ms wait
    const code1 = `
    export default async function(inputs, { integrations }) {
      await new Promise(r => setTimeout(r, 10)); 
      const ping = await integrations.getPing();
      return await ping.ping("hello");
    }
    `;

    // Code 2: 20ms wait - changes pmarker before ping
    const code2 = `
    export default async function(inputs, { integrations }) {
      await new Promise(r => setTimeout(r, 20)); 
      const ping = await integrations.getPing();
      return await ping.ping("hello");
    }
    `;

    const runId = `test-run-pmarker-${Date.now()}`;

    const res1 = await executeTypescript(code1, {}, runId);
    const timestamp1 = (res1.result.result as { timestamp: number }).timestamp;

    await new Promise((resolve) => setTimeout(resolve, 100));

    const res2 = await executeTypescript(code2, {}, runId);
    const timestamp2 = (res2.result.result as { timestamp: number }).timestamp;

    expect(timestamp2, "Timestamps should be different").toBeGreaterThan(timestamp1);
  });
});
