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
  inputs?: Record<string, unknown>
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
    JSON.stringify({ code: fullCode, inputs })
  );

  return {
    status: response.status,
    result: JSON.parse(response.data),
  };
}

describe("Sandbox", () => {
  it("sandbox health check", async () => {
    const response = await makeRequest({
      hostname: "sandbox.subroutine.internal",
      path: "/_status",
      method: "GET",
      headers: MOCK_HEADERS,
    });

    expect(response.status, "Sandbox should return 200 status").toBe(200);
    expect(response.data, "Should return live status").toBe('{"status":"live"}');
  });

  it("execute TypeScript with inputs", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({ value: z.number() });
      const { value } = InputSchema.parse(inputs);
      return { result: value * 2 };
    }
  `;
    const { status, result } = await executeTypescript(code, { value: 21 });

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should double input value").toEqual({ result: 42 });
  });

  it("fails validation with invalid inputs", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({ value: z.number() });
      const { value } = InputSchema.parse(inputs);
      return { result: value * 2 };
    }
  `;
    // Pass string instead of number
    const { status, result } = await executeTypescript(code, { value: "not a number" });

    expect(status, "HTTP status should be 400 for runtime error").toBe(400);
    expect(result.success, "Result should indicate failure").toBe(false);
    expect(result.error, "Error should mention zod validation").toContain(
      "Expected number, received string"
    );
  });

  it("execute simple TypeScript code", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({}); // No inputs expected
      InputSchema.parse(inputs);
      return 42;
    }
    `;
    const { status, result } = await executeTypescript(code, {});

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should compute 42").toBe(42);
  });

  it("execute TypeScript with string return", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({});
      InputSchema.parse(inputs);
      return 'Hello, World!';
    }
    `;
    const { status, result } = await executeTypescript(code, {});

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should return greeting string").toBe("Hello, World!");
  });

  it("execute TypeScript with object return", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({});
      InputSchema.parse(inputs);
      const obj = { name: 'test', value: 123, nested: { key: 'value' } };
      return obj;
    }
  `;
    const { status, result } = await executeTypescript(code, {});

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should return expected object").toEqual({
      name: "test",
      value: 123,
      nested: { key: "value" },
    });
  });

  it("execute TypeScript with array operations", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({});
      InputSchema.parse(inputs);
      const arr = [1, 2, 3, 4, 5];
      return arr.map(x => x * 2).filter(x => x > 5);
    }
  `;
    const { status, result } = await executeTypescript(code, {});

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should map/filter to [6,8,10]").toEqual([6, 8, 10]);
  });

  it("execute async TypeScript code", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({});
      InputSchema.parse(inputs);
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'async completed';
    }
  `;
    const { status, result } = await executeTypescript(code, {});

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should return async completion msg").toBe("async completed");
  });

  it("handle TypeScript syntax errors", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      return this is not valid syntax;
    }
    `;
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status should be 400 for syntax errors").toBe(400);
    expect(result.success, "Result should indicate failure").toBe(false);
    expect(result.error ?? "", "Error should mention parse failure").toContain(
      "could not be parsed"
    );
  });

  it("handle runtime errors", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const obj = null;
      return obj.property;
    }
  `;
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status should be 400 for runtime errors").toBe(400);
    expect(result.success, "Result should indicate failure").toBe(false);
    expect(result.error ?? "", "Error should mention null access").toContain("null");
  });

  it("sandbox isolation - file system access denied", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({});
      InputSchema.parse(inputs);
      try {
        await Deno.readTextFile('/etc/passwd');
        return 'should not succeed';
      } catch (error) {
        return error.message;
      }
    }
  `;
    const { status, result } = await executeTypescript(code, {});

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(String(result.result), "Should deny file read").toContain("Requires read access");
  });

  it("sandbox isolation - network access denied", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({});
      InputSchema.parse(inputs);
      try {
        await fetch('https://example.com');
        return 'should not succeed';
      } catch (error) {
        return error.message;
      }
    }
  `;
    const { status, result } = await executeTypescript(code, {});

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(String(result.result), "Should deny network access").toContain("Requires net access");
  });

  it("sandbox isolation - env access denied", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({});
      InputSchema.parse(inputs);
      try {
        Deno.env.get('HOME');
        return 'should not succeed';
      } catch (error) {
        return error.message;
      }
    }
  `;
    const { status, result } = await executeTypescript(code, {});

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(String(result.result), "Should deny env access").toContain("Requires env access");
  });

  it("execute JavaScript with arrow functions", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({ a: z.number(), b: z.number() });
      const safeInputs = InputSchema.parse(inputs);
      const add = (a, b) => a + b;
      return add(safeInputs.a, safeInputs.b);
    }
  `;
    const { status, result } = await executeTypescript(code, { a: 10, b: 20 });

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should add using arrow function").toBe(30);
  });

  it("execute complex JavaScript logic", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const UserSchema = z.object({ name: z.string(), age: z.number() });
      const InputSchema = z.object({ users: z.array(UserSchema) });
      const { users } = InputSchema.parse(inputs);

      const avgAge = users.reduce((sum, user) => sum + user.age, 0) / users.length;
      return { count: users.length, averageAge: avgAge };
    }
  `;
    const users = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
      { name: "Charlie", age: 35 },
    ];
    const { status, result } = await executeTypescript(code, { users });

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should compute count and averageAge").toEqual({
      count: 3,
      averageAge: 30,
    });
  });

  // Integration RPC tests
  it("ping integration via RPC worker", async () => {
    const code = `
      export default async function(inputs, { integrations }) {
        const InputSchema = z.object({ message: z.string() });
        const { message } = InputSchema.parse(inputs);
        const ping = await integrations.getPing();
        const response = await ping.ping(message);
        return response;
      }
    `;
    const { status, result } = await executeTypescript(code, { message: "Hello from user code!" });

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should return ping response").toHaveProperty("echo");
    expect((result.result as { echo: string }).echo, "Should echo message").toBe(
      "Hello from user code!"
    );
    expect(result.result, "Should have timestamp").toHaveProperty("timestamp");
  });

  it("gmail integration via RPC worker", async () => {
    const code = `
      export default async function(inputs, { integrations }) {
        const InputSchema = z.object({ userId: z.string() });
        const { userId } = InputSchema.parse(inputs);
        const gmail = await integrations.getGmail();
        const result = await gmail.users.labels.list({ userId });
        const labels = result.data.labels?.map(l => l.name) || [];
        return { labels };
      }
    `;
    const { status, result } = await executeTypescript(code, { userId: "me" });

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect((result.result as { labels: string[] }).labels, "Should return labels").toEqual([
      "INBOX",
      "STARRED",
    ]);
  });

  it("s3 integration via RPC worker", async () => {
    const code = `
      export default async function(inputs, { integrations }) {
        const InputSchema = z.object({});
        InputSchema.parse(inputs);
        const s3 = await integrations.getS3();
        const buckets = await s3.listBuckets();
        return buckets;
      }
    `;
    const { status, result } = await executeTypescript(code, {});

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect((result.result as { buckets: string[] }).buckets, "Should return buckets").toEqual([
      "photos",
      "backups",
    ]);
  });

  it("github integration via RPC worker", async () => {
    const code = `
      export default async function(inputs, { integrations }) {
        const InputSchema = z.object({});
        InputSchema.parse(inputs);
        const github = await integrations.getGithub();
        const me = await github.me();
        return me;
      }
    `;
    const { status, result } = await executeTypescript(code, {});

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect((result.result as { login: string }).login, "Should return login").toBe("octocat");
  });

  it("post-tsmorph transformed code is deterministic", async () => {
    const code = `
    export default async function(inputs, { integrations }) {
      const InputSchema = z.object({ value: z.number() });
      const { value } = InputSchema.parse(inputs);
      return { result: value * 2 };
    }
    `;
    const response1 = await executeTypescript(code, { value: 10 });
    const response2 = await executeTypescript(code, { value: 10 });

    expect(response1.status).toBe(200);
    expect(response1.result.success).toBe(true);
    expect(response1.result.code).toBeDefined();

    expect(response2.status).toBe(200);
    expect(response2.result.success).toBe(true);
    expect(response2.result.code).toBeDefined();

    expect(response1.result.code).toBe(response2.result.code);
  });

  it("pmarkers stay the same with a shared code prefix and change after the code changes", async () => {
    const code1 = `
    export default async function(inputs, { integrations }) {
      await new Promise(r => setTimeout(r, 10));
      await new Promise(r => setTimeout(r, 10));
      return 'done';
    }
    `;

    const code2 = `
    export default async function(inputs, { integrations }) {
      await new Promise(r => setTimeout(r, 20));
      await new Promise(r => setTimeout(r, 10));
      return 'done';
    }
    `;

    const response1 = await executeTypescript(code1, {});
    const response2 = await executeTypescript(code2, {});

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    const getPmarkers = (code: string) => {
      const match = code.matchAll(/pmarker\('([a-f0-9]+)'\)/g);
      return Array.from(match).map((m) => m[1]);
    };

    const pmarkers1 = getPmarkers(response1.result.code || "");
    const pmarkers2 = getPmarkers(response2.result.code || "");
    console.log("pmarkers1", pmarkers1);
    console.log("pmarkers2", pmarkers2);

    expect(pmarkers1.length).toBe(2);
    expect(pmarkers2.length).toBe(2);

    // The first await is physically at the same location relative to start,
    // and the code before it is identical (imports + function signature + indentation).
    // So the first pmarker should be the same.
    expect(pmarkers1[0], "First pmarker should be identical").toBe(pmarkers2[0]);

    // The second await has different code preceding it (setTimeout 10 vs 20).
    // So the second pmarker should be different.
    expect(pmarkers1[1], "Second pmarker should be divergent").not.toBe(pmarkers2[1]);
  });
});
