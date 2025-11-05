// Deno lints: strict
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";

interface TestResponse {
  status: number;
  data: string;
}

interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

function makeRequest(options: { hostname: string; port: number; path: string; method?: string; headers?: HeadersInit }, data?: string): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const req = new Request(`http://${options.hostname}:${options.port}${options.path}`, {
      method: options.method || "GET",
      headers: options.headers,
      body: data
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

async function executeTypescript(code: string): Promise<{ status: number; result: ExecutionResult }> {
  const response = await makeRequest({
    hostname: "sandbox",
    port: 3000,
    path: "/test/executeTypescript",
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }, JSON.stringify({ code }));

  return {
    status: response.status,
    result: JSON.parse(response.data)
  };
}

// Wait for sandbox to be fully ready (healthcheck ensures it's healthy, but PM2 needs extra time)
await new Promise(resolve => setTimeout(resolve, 5000));

Deno.test("sandbox health check", async () => {
  const response = await makeRequest({
    hostname: "sandbox",
    port: 3000,
    path: "/_status",
    method: "GET"
  });

  assertEquals(response.status, 200, "Sandbox should return 200 status");
  assertEquals(response.data, '{"status":"live"}', "Should return live status");
});

Deno.test("execute simple TypeScript code", async () => {
  const { status, result } = await executeTypescript("return 42;");

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.result, 42);
});

Deno.test("execute TypeScript with string return", async () => {
  const { status, result } = await executeTypescript("return 'Hello, World!';");

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.result, "Hello, World!");
});

Deno.test("execute TypeScript with object return", async () => {
  const code = `
    const obj = { name: 'test', value: 123, nested: { key: 'value' } };
    return obj;
  `;
  const { status, result } = await executeTypescript(code);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.result, { name: 'test', value: 123, nested: { key: 'value' } });
});

Deno.test("execute TypeScript with array operations", async () => {
  const code = `
    const arr = [1, 2, 3, 4, 5];
    return arr.map(x => x * 2).filter(x => x > 5);
  `;
  const { status, result } = await executeTypescript(code);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.result, [6, 8, 10]);
});

Deno.test("execute async TypeScript code", async () => {
  const code = `
    await new Promise(resolve => setTimeout(resolve, 100));
    return 'async completed';
  `;
  const { status, result } = await executeTypescript(code);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.result, "async completed");
});

Deno.test("handle TypeScript syntax errors", async () => {
  const code = "return this is not valid syntax;";
  const { status, result } = await executeTypescript(code);

  assertEquals(status, 400);
  assertEquals(result.success, false);
  assertStringIncludes(result.error || "", "Unexpected identifier");
});

Deno.test("handle runtime errors", async () => {
  const code = `
    const obj = null;
    return obj.property;
  `;
  const { status, result } = await executeTypescript(code);

  assertEquals(status, 400);
  assertEquals(result.success, false);
  assertStringIncludes(result.error || "", "null");
});

Deno.test("sandbox isolation - file system access denied", async () => {
  const code = `
    try {
      await Deno.readTextFile('/etc/passwd');
      return 'should not succeed';
    } catch (error) {
      return error.message;
    }
  `;
  const { status, result } = await executeTypescript(code);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertStringIncludes(String(result.result), "Requires read access");
});

Deno.test("sandbox isolation - network access denied", async () => {
  const code = `
    try {
      await fetch('https://example.com');
      return 'should not succeed';
    } catch (error) {
      return error.message;
    }
  `;
  const { status, result } = await executeTypescript(code);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertStringIncludes(String(result.result), "Requires net access");
});

Deno.test("sandbox isolation - env access denied", async () => {
  const code = `
    try {
      Deno.env.get('HOME');
      return 'should not succeed';
    } catch (error) {
      return error.message;
    }
  `;
  const { status, result } = await executeTypescript(code);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertStringIncludes(String(result.result), "Requires env access");
});

Deno.test("execute JavaScript with arrow functions", async () => {
  const code = `
    const add = (a, b) => a + b;
    return add(10, 20);
  `;
  const { status, result } = await executeTypescript(code);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.result, 30);
});

Deno.test("execute complex JavaScript logic", async () => {
  const code = `
    const users = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
      { name: 'Charlie', age: 35 }
    ];

    const avgAge = users.reduce((sum, user) => sum + user.age, 0) / users.length;
    return { count: users.length, averageAge: avgAge };
  `;
  const { status, result } = await executeTypescript(code);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.result, { count: 3, averageAge: 30 });
});