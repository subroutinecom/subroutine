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
}

interface CommandExecutionResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
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

async function executeTypescript(code: string): Promise<{ status: number; result: ExecutionResult }> {
  // Wrap code in module format with default export
  // Use string concatenation to avoid template literal conflicts
  const wrappedCode = "\nexport default async function() {\n  " + code + "\n}\n";

  const response = await makeRequest(
    {
      hostname: "sandbox",
      path: "/test/executeTypescript",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ code: wrappedCode })
  );

  return {
    status: response.status,
    result: JSON.parse(response.data),
  };
}

async function executeCommand(
  command: string,
  args?: string[],
  filesystem?: Record<string, string>,
  env?: Record<string, string>,
  timeout?: number
): Promise<{ status: number; result: CommandExecutionResult }> {
  const response = await makeRequest(
    {
      hostname: "sandbox",
      path: "/test/executeCommand",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ command, args, filesystem, env, timeout })
  );

  return {
    status: response.status,
    result: JSON.parse(response.data),
  };
}

describe("Sandbox", () => {
  it("sandbox health check", async () => {
    const response = await makeRequest({
      hostname: "sandbox",
      path: "/_status",
      method: "GET",
      headers: MOCK_HEADERS,
    });

    expect(response.status, "Sandbox should return 200 status").toBe(200);
    expect(response.data, "Should return live status").toBe('{"status":"live"}');
  });

  it("execute simple TypeScript code", async () => {
    const { status, result } = await executeTypescript("return 42;");

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should compute 42").toBe(42);
  });

  it("execute TypeScript with string return", async () => {
    const { status, result } = await executeTypescript("return 'Hello, World!';");

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should return greeting string").toBe("Hello, World!");
  });

  it("execute TypeScript with object return", async () => {
    const code = `
    const obj = { name: 'test', value: 123, nested: { key: 'value' } };
    return obj;
  `;
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should return expected object").toEqual({ name: "test", value: 123, nested: { key: "value" } });
  });

  it("execute TypeScript with array operations", async () => {
    const code = `
    const arr = [1, 2, 3, 4, 5];
    return arr.map(x => x * 2).filter(x => x > 5);
  `;
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should map/filter to [6,8,10]").toEqual([6, 8, 10]);
  });

  it("execute async TypeScript code", async () => {
    const code = `
    await new Promise(resolve => setTimeout(resolve, 100));
    return 'async completed';
  `;
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should return async completion msg").toBe("async completed");
  });

  it("handle TypeScript syntax errors", async () => {
    const code = "return this is not valid syntax;";
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status should be 400 for syntax errors").toBe(400);
    expect(result.success, "Result should indicate failure").toBe(false);
    // Deno's TS compiler gives different error messages like "Expected ';', got 'is'"
    expect(result.error ?? "", "Error should mention parse failure").toContain("could not be parsed");
  });

  it("handle runtime errors", async () => {
    const code = `
    const obj = null;
    return obj.property;
  `;
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status should be 400 for runtime errors").toBe(400);
    expect(result.success, "Result should indicate failure").toBe(false);
    expect(result.error ?? "", "Error should mention null access").toContain("null");
  });

  it("sandbox isolation - file system access denied", async () => {
    const code = `
    try {
      await Deno.readTextFile('/etc/passwd');
      return 'should not succeed';
    } catch (error) {
      return error.message;
    }
  `;
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(String(result.result), "Should deny file read").toContain("Requires read access");
  });

  it("sandbox isolation - network access denied", async () => {
    const code = `
    try {
      await fetch('https://example.com');
      return 'should not succeed';
    } catch (error) {
      return error.message;
    }
  `;
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(String(result.result), "Should deny network access").toContain("Requires net access");
  });

  it("sandbox isolation - env access denied", async () => {
    const code = `
    try {
      Deno.env.get('HOME');
      return 'should not succeed';
    } catch (error) {
      return error.message;
    }
  `;
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(String(result.result), "Should deny env access").toContain("Requires env access");
  });

  it("execute JavaScript with arrow functions", async () => {
    const code = `
    const add = (a, b) => a + b;
    return add(10, 20);
  `;
    const { status, result } = await executeTypescript(code);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should add using arrow function").toBe(30);
  });

  it("execute complex JavaScript logic", async () => {
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

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Result should indicate success").toBe(true);
    expect(result.result, "Should compute count and averageAge").toEqual({ count: 3, averageAge: 30 });
  });

  // Bubblewrap command execution tests

  it("execute simple command with bubblewrap", async () => {
    const { status, result } = await executeCommand("echo", ["Hello, Bubblewrap!"]);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Command should succeed").toBe(true);
    expect(result.exitCode, "Exit code should be 0").toBe(0);
    expect(result.stdout ?? "", "Stdout should contain greeting").toContain("Hello, Bubblewrap!");
  });

  it("execute command with filesystem - single file", async () => {
    const filesystem = {
      "/test.txt": "Hello from file!",
    };

    const { status, result } = await executeCommand("cat", ["test.txt"], filesystem);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Command should succeed").toBe(true);
    expect(result.exitCode, "Exit code should be 0").toBe(0);
    expect(result.stdout?.trim(), "Should read file content").toBe("Hello from file!");
  });

  it("execute command with filesystem - nested directories", async () => {
    const filesystem = {
      "/dir1/dir2/file.txt": "nested content",
    };

    const { status, result } = await executeCommand("cat", ["dir1/dir2/file.txt"], filesystem);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Command should succeed").toBe(true);
    expect(result.exitCode, "Exit code should be 0").toBe(0);
    expect(result.stdout?.trim(), "Should read nested file content").toBe("nested content");
  });

  it("execute command with multiple files", async () => {
    const filesystem = {
      "/file1.txt": "content1",
      "/file2.txt": "content2",
      "/file3.txt": "content3",
    };

    const { status, result } = await executeCommand("ls", ["-1"], filesystem);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Command should succeed").toBe(true);
    expect(result.exitCode, "Exit code should be 0").toBe(0);
    expect(result.stdout ?? "", "Stdout should list file1").toContain("file1.txt");
    expect(result.stdout ?? "", "Stdout should list file2").toContain("file2.txt");
    expect(result.stdout ?? "", "Stdout should list file3").toContain("file3.txt");
  });

  it("execute grep on files", async () => {
    const filesystem = {
      "/data.txt": "line1: hello\nline2: world\nline3: hello again",
    };

    const { status, result } = await executeCommand("grep", ["hello", "data.txt"], filesystem);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Command should succeed").toBe(true);
    expect(result.exitCode, "Exit code should be 0").toBe(0);
    expect(result.stdout ?? "", "Grep should match line1").toContain("line1: hello");
    expect(result.stdout ?? "", "Grep should match line3").toContain("line3: hello again");
  });

  it("execute shell script", async () => {
    const filesystem = {
      "/script.sh": "#!/bin/sh\necho 'Script executed'\nexit 0",
    };

    const { status, result } = await executeCommand("sh", ["script.sh"], filesystem);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Command should succeed").toBe(true);
    expect(result.exitCode, "Exit code should be 0").toBe(0);
    expect(result.stdout ?? "", "Script should print message").toContain("Script executed");
  });

  it("handle command failure", async () => {
    const { status, result } = await executeCommand("ls", ["nonexistent-file"]);

    expect(status, "HTTP status should be 400 on failure").toBe(400);
    expect(result.success, "Result should indicate failure").toBe(false);
    expect(result.exitCode, "Exit code should be 2").toBe(2);
    expect(result.stderr ?? "", "Stderr should describe missing file").toContain("cannot access");
  });

  it("command with custom environment variables", async () => {
    const filesystem = {
      "/test.sh": "#!/bin/sh\necho $CUSTOM_VAR",
    };

    const env = {
      CUSTOM_VAR: "custom_value",
    };

    const { status, result } = await executeCommand("sh", ["test.sh"], filesystem, env);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Command should succeed").toBe(true);
    expect(result.stdout?.trim(), "Script should see env var").toBe("custom_value");
  });

  it("bubblewrap isolation - workspace isolation", async () => {
    // Bubblewrap provides PID and IPC namespace isolation
    // When we provide a filesystem, the command only sees those files in the workspace
    const filesystem = {
      "/myfile.txt": "isolated content",
    };

    const { status, result } = await executeCommand("ls", ["-la"], filesystem);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Command should succeed").toBe(true);
    // The workspace should contain our file
    expect(result.stdout ?? "", "Workspace should list myfile.txt").toContain("myfile.txt");
    // Verify the file content is accessible
    const { result: catResult } = await executeCommand("cat", ["myfile.txt"], filesystem);
    expect(catResult.stdout?.trim(), "Should read isolated content").toBe("isolated content");
  });

  it("execute python script via bubblewrap", async () => {
    const filesystem = {
      "/script.py": "print('Hello from Python')\nprint(2 + 2)",
    };

    const { status, result } = await executeCommand("python3", ["script.py"], filesystem);

    expect(status, "HTTP status is 200").toBe(200);
    expect(result.success, "Command should succeed").toBe(true);
    expect(result.exitCode, "Exit code should be 0").toBe(0);
    expect(result.stdout ?? "", "Python script should greet").toContain("Hello from Python");
    expect(result.stdout ?? "", "Python script should compute 2+2").toContain("4");
  });
});
