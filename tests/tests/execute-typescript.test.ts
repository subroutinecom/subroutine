// Deno lints: strict
import { assertEquals, assertStringIncludes } from "@std/assert";

interface TestResponse {
  status: number;
  data: string;
}

interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

interface CommandExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
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
  // Wrap code in module format with default export
  // Use string concatenation to avoid template literal conflicts
  const wrappedCode = "\nexport default async function() {\n  " + code + "\n}\n";

  const response = await makeRequest({
    hostname: "sandbox",
    port: 3000,
    path: "/test/executeTypescript",
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }, JSON.stringify({ code: wrappedCode }));

  return {
    status: response.status,
    result: JSON.parse(response.data)
  };
}

async function executeCommand(
  command: string,
  args?: string[],
  filesystem?: Record<string, string>,
  env?: Record<string, string>,
  timeout?: number
): Promise<{ status: number; result: CommandExecutionResult }> {
  const response = await makeRequest({
    hostname: "sandbox",
    port: 3000,
    path: "/test/executeCommand",
    method: "POST",
    headers: { "Content-Type": "application/json" }
  }, JSON.stringify({ command, args, filesystem, env, timeout }));

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
  // Deno's TS compiler gives different error messages like "Expected ';', got 'is'"
  assertStringIncludes(result.error || "", "could not be parsed");
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

// Bubblewrap command execution tests

Deno.test("execute simple command with bubblewrap", async () => {
  const { status, result } = await executeCommand("echo", ["Hello, Bubblewrap!"]);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout || "", "Hello, Bubblewrap!");
});

Deno.test("execute command with filesystem - single file", async () => {
  const filesystem = {
    "/test.txt": "Hello from file!",
  };

  const { status, result } = await executeCommand("cat", ["test.txt"], filesystem);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.exitCode, 0);
  assertEquals(result.stdout?.trim(), "Hello from file!");
});

Deno.test("execute command with filesystem - nested directories", async () => {
  const filesystem = {
    "/dir1/dir2/file.txt": "nested content",
  };

  const { status, result } = await executeCommand("cat", ["dir1/dir2/file.txt"], filesystem);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.exitCode, 0);
  assertEquals(result.stdout?.trim(), "nested content");
});

Deno.test("execute command with multiple files", async () => {
  const filesystem = {
    "/file1.txt": "content1",
    "/file2.txt": "content2",
    "/file3.txt": "content3",
  };

  const { status, result } = await executeCommand("ls", ["-1"], filesystem);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout || "", "file1.txt");
  assertStringIncludes(result.stdout || "", "file2.txt");
  assertStringIncludes(result.stdout || "", "file3.txt");
});

Deno.test("execute grep on files", async () => {
  const filesystem = {
    "/data.txt": "line1: hello\nline2: world\nline3: hello again",
  };

  const { status, result } = await executeCommand("grep", ["hello", "data.txt"], filesystem);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout || "", "line1: hello");
  assertStringIncludes(result.stdout || "", "line3: hello again");
});

Deno.test("execute shell script", async () => {
  const filesystem = {
    "/script.sh": "#!/bin/sh\necho 'Script executed'\nexit 0",
  };

  const { status, result } = await executeCommand("sh", ["script.sh"], filesystem);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout || "", "Script executed");
});

Deno.test("handle command failure", async () => {
  const { status, result } = await executeCommand("ls", ["nonexistent-file"]);

  assertEquals(status, 400);
  assertEquals(result.success, false);
  assertEquals(result.exitCode, 2);
  assertStringIncludes(result.stderr || "", "cannot access");
});

Deno.test("command with custom environment variables", async () => {
  const filesystem = {
    "/test.sh": "#!/bin/sh\necho $CUSTOM_VAR",
  };

  const env = {
    CUSTOM_VAR: "custom_value",
  };

  const { status, result } = await executeCommand("sh", ["test.sh"], filesystem, env);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.stdout?.trim(), "custom_value");
});

Deno.test("bubblewrap isolation - workspace isolation", async () => {
  // Bubblewrap provides PID and IPC namespace isolation
  // When we provide a filesystem, the command only sees those files in the workspace
  const filesystem = {
    "/myfile.txt": "isolated content",
  };

  const { status, result } = await executeCommand("ls", ["-la"], filesystem);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  // The workspace should contain our file
  assertStringIncludes(result.stdout || "", "myfile.txt");
  // Verify the file content is accessible
  const { result: catResult } = await executeCommand("cat", ["myfile.txt"], filesystem);
  assertEquals(catResult.stdout?.trim(), "isolated content");
});

Deno.test("execute python script via bubblewrap", async () => {
  const filesystem = {
    "/script.py": "print('Hello from Python')\nprint(2 + 2)",
  };

  const { status, result } = await executeCommand("python3", ["script.py"], filesystem);

  assertEquals(status, 200);
  assertEquals(result.success, true);
  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout || "", "Hello from Python");
  assertStringIncludes(result.stdout || "", "4");
});