import { expect } from "@std/expect";
import { it } from "@std/testing/bdd";

interface TestResponse {
  status: number;
  data: string;
}

interface Subroutine {
  id: string;
  source: string;
  inputsSchema?: Record<string, unknown>;
  outputsSchema?: Record<string, unknown>;
  createdFrom: { request: string };
  createdAt: string;
}

interface Run {
  id: string;
  subroutineId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  startedAt?: string | null;
  endedAt?: string | null;
  outputs?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
}

const MOCK_HEADERS: HeadersInit = { "x-use-mock": "true" };

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

it("admin-panel health check", async () => {
  const response = await makeRequest({
    hostname: "api",
    path: "/status",
    method: "GET",
    headers: MOCK_HEADERS,
  });

  expect(response.status, "Server should return 200 status").toBe(200);
  const data = JSON.parse(response.data);
  expect(data.status, "Server should return ok status").toBe("ok");
});

it("create subroutine via REST API", async () => {
  const response = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({
      useMock: true,
      request: "Create a function that adds two numbers",
    })
  );

  expect(response.status, "Should return 201 Created").toBe(201);

  const data = JSON.parse(response.data);
  const subroutine: Subroutine = data.subroutine;
  expect(typeof subroutine.id, "Should have an ID").toBe("string");
  expect(typeof subroutine.source, "Should have source code").toBe("string");
  expect(subroutine.createdFrom.request, "Should retain original request").toBe("Create a function that adds two numbers");
  expect(typeof subroutine.createdAt, "Should have createdAt timestamp").toBe("string");
  expect(typeof data.subroutineUri, "Should have subroutineUri").toBe("string");
});

it("get specific subroutine by ID", async () => {
  // First create a subroutine
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Test subroutine for retrieval" })
  );

  const createData = JSON.parse(createResponse.data);
  const created: Subroutine = createData.subroutine;

  // Then retrieve it
  const getResponse = await makeRequest({
    hostname: "api",
    path: `/api/subroutines/${created.id}`,
    method: "GET",
    headers: MOCK_HEADERS,
  });

  expect(getResponse.status, "Should return 200 OK").toBe(200);

  const getData = JSON.parse(getResponse.data);
  const retrieved: Subroutine = getData.subroutine;
  expect(retrieved.id, "Should return same subroutine").toBe(created.id);
  expect(retrieved.createdFrom.request, "Should preserve createdFrom.request").toBe("Test subroutine for retrieval");
});

it("list all subroutines", async () => {
  // Create at least one subroutine
  await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Test subroutine for listing" })
  );

  // List all subroutines
  const response = await makeRequest({
    hostname: "api",
    path: "/api/subroutines",
    method: "GET",
    headers: MOCK_HEADERS,
  });

  expect(response.status, "Should return 200 OK").toBe(200);

  const data = JSON.parse(response.data);
  const subroutines: Subroutine[] = data.subroutines;
  expect(Array.isArray(subroutines), "Should return an array").toBe(true);
  expect(subroutines.length > 0, "Should have at least one subroutine").toBe(true);
});

it("run a subroutine", async () => {
  // First create a subroutine
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Test subroutine for execution" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  // Then run it
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  expect(runResponse.status, "Should return 201 Created").toBe(201);

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;
  expect(typeof run.id, "Run should have an ID").toBe("string");
  expect(run.subroutineId, "Run should reference the subroutine").toBe(subroutine.id);
  expect(["queued", "running", "succeeded"].includes(run.status), "Run should have valid status").toBe(true);
  expect(typeof runData.runUri, "Should have runUri").toBe("string");
});

it("get run status and wait for completion", async () => {
  // Create and run a subroutine
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Test subroutine for run status" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  // Wait for completion (mock execution takes ~110ms)
  await new Promise((resolve) => setTimeout(resolve, 200));

  // Check run status
  const statusResponse = await makeRequest({
    hostname: "api",
    path: `/api/runs/${run.id}`,
    method: "GET",
    headers: MOCK_HEADERS,
  });

  expect(statusResponse.status, "Should return 200 OK").toBe(200);

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;
  expect(completedRun.status, "Run should be completed").toBe("succeeded");
  expect(typeof completedRun.startedAt, "Should have startedAt timestamp").toBe("string");
  expect(typeof completedRun.endedAt, "Should have endedAt timestamp").toBe("string");
  expect(completedRun.outputs !== null, "Should have outputs").toBe(true);
});

it("list all runs", async () => {
  // Create and run a subroutine to ensure there's at least one run
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Test subroutine for run listing" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  // List all runs
  const response = await makeRequest({
    hostname: "api",
    path: "/api/runs",
    method: "GET",
    headers: MOCK_HEADERS,
  });

  expect(response.status, "Should return 200 OK").toBe(200);

  const data = JSON.parse(response.data);
  const runs: Run[] = data.runs;
  expect(Array.isArray(runs), "Should return an array").toBe(true);
  expect(runs.length > 0, "Should have at least one run").toBe(true);
});

it("get non-existent subroutine returns 404", async () => {
  const response = await makeRequest({
    hostname: "api",
    path: "/api/subroutines/non-existent-id",
    method: "GET",
    headers: MOCK_HEADERS,
  });

  expect(response.status, "Should return 404 Not Found").toBe(404);
  const errorData = JSON.parse(response.data);
  expect(typeof errorData.error, "Should have error object").toBe("object");
  expect(typeof errorData.error.message, "Should have error message").toBe("string");
});

it("run non-existent subroutine returns 404", async () => {
  const response = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines/non-existent-id/run",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  expect(response.status, "Should return 404 Not Found").toBe(404);
  const errorData = JSON.parse(response.data);
  expect(typeof errorData.error, "Should have error object").toBe("object");
  expect(typeof errorData.error.message, "Should have error message").toBe("string");
});

it("get non-existent run returns 404", async () => {
  const response = await makeRequest({
    hostname: "api",
    path: "/api/runs/non-existent-id",
    method: "GET",
    headers: MOCK_HEADERS,
  });

  expect(response.status, "Should return 404 Not Found").toBe(404);
  const errorData = JSON.parse(response.data);
  expect(typeof errorData.error, "Should have error object").toBe("object");
  expect(typeof errorData.error.message, "Should have error message").toBe("string");
});

it("create subroutine without request field returns 400", async () => {
  const response = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true })
  ); // Missing 'request' field

  expect(response.status, "Should return 400 Bad Request").toBe(400);
  const errorData = JSON.parse(response.data);
  expect(typeof errorData.error, "Should have error object").toBe("object");
  expect(typeof errorData.error.message, "Should have error message").toBe("string");
  expect(errorData.error.message, "Error should mention missing request field").toContain("request");
});

it("create multiple subroutines have unique IDs", async () => {
  const response1 = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "First subroutine" })
  );

  const response2 = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Second subroutine" })
  );

  const data1 = JSON.parse(response1.data);
  const data2 = JSON.parse(response2.data);
  const sub1: Subroutine = data1.subroutine;
  const sub2: Subroutine = data2.subroutine;

  expect(sub1.id !== sub2.id, "Subroutines should have unique IDs").toBe(true);
});

it("multiple runs of same subroutine have unique IDs", async () => {
  // Create a subroutine
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Test subroutine for multiple runs" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  // Run it twice
  const run1Response = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  const run2Response = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  const run1Data = JSON.parse(run1Response.data);
  const run2Data = JSON.parse(run2Response.data);
  const run1: Run = run1Data.run;
  const run2: Run = run2Data.run;

  expect(run1.id !== run2.id, "Runs should have unique IDs").toBe(true);
  expect(run1.subroutineId, "Both runs should reference same subroutine").toBe(subroutine.id);
  expect(run2.subroutineId, "Both runs should reference same subroutine").toBe(subroutine.id);
});

// ========================================
// SANDBOX EXECUTION TESTS
// ========================================

it("subroutine actually executes addition in sandbox", async () => {
  // Create a subroutine that adds numbers
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Create a function that adds two numbers" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  // Verify the generated code includes addition logic
  expect(subroutine.source, "Generated code should mention addition").toContain("add");

  // Run it with custom inputs
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: { a: 15, b: 27 } })
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  // Wait for execution to complete
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Check that it actually computed the sum
  const statusResponse = await makeRequest({
    hostname: "api",
    path: `/api/runs/${run.id}`,
    method: "GET",
    headers: MOCK_HEADERS,
  });

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;

  expect(completedRun.status, "Run should succeed").toBe("succeeded");
  expect(completedRun.outputs !== null, "Should have outputs").toBe(true);
  expect((completedRun.outputs as Record<string, unknown>)?.result, "Should compute 15 + 27 = 42").toBe(42);
});

it("subroutine executes fibonacci in sandbox", async () => {
  // Create a subroutine that generates fibonacci sequence
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Generate fibonacci sequence" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  // Run it
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: { n: 8 } })
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  // Wait for execution
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const statusResponse = await makeRequest({
    hostname: "api",
    path: `/api/runs/${run.id}`,
    method: "GET",
    headers: MOCK_HEADERS,
  });

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;

  expect(completedRun.status, "Run should succeed").toBe("succeeded");
  const outputs = completedRun.outputs as Record<string, unknown>;
  const sequence = outputs?.sequence as number[];
  expect(Array.isArray(sequence), "Should return an array").toBe(true);
  expect(sequence[0], "First fibonacci number should be 0").toBe(0);
  expect(sequence[1], "Second fibonacci number should be 1").toBe(1);
  expect(sequence[7], "8th fibonacci number should be 13").toBe(13);
});

it("subroutine with string reversal executes correctly", async () => {
  // Create a subroutine that reverses strings
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Reverse a string" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  // Run it with custom text
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: { text: "TypeScript" } })
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  // Wait for execution
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const statusResponse = await makeRequest({
    hostname: "api",
    path: `/api/runs/${run.id}`,
    method: "GET",
    headers: MOCK_HEADERS,
  });

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;

  expect(completedRun.status, "Run should succeed").toBe("succeeded");
  const outputs = completedRun.outputs as Record<string, unknown>;
  expect(outputs?.reversed, "Should reverse 'TypeScript' to 'tpircSepyT'").toBe("tpircSepyT");
});

it("default hello world with custom name input", async () => {
  // Create a generic subroutine (should use default hello world)
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Say hello" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  // Run with custom name
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: { name: "Sandbox" } })
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  // Wait for execution
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const statusResponse = await makeRequest({
    hostname: "api",
    path: `/api/runs/${run.id}`,
    method: "GET",
    headers: MOCK_HEADERS,
  });

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;

  expect(completedRun.status, "Run should succeed").toBe("succeeded");
  const outputs = completedRun.outputs as Record<string, unknown>;
  expect(outputs?.message, "Should greet with custom name").toBe("Hello, Sandbox!");
  expect(typeof outputs?.timestamp, "Should have timestamp").toBe("string");
});

it("multiplication subroutine executes correctly", async () => {
  // Create a subroutine that multiplies numbers
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Multiply two numbers" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  // Run with custom inputs
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: { a: 8, b: 9 } })
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  // Wait for execution
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const statusResponse = await makeRequest({
    hostname: "api",
    path: `/api/runs/${run.id}`,
    method: "GET",
    headers: MOCK_HEADERS,
  });

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;

  expect(completedRun.status, "Run should succeed").toBe("succeeded");
  const outputs = completedRun.outputs as Record<string, unknown>;
  expect(outputs?.result, "Should compute 8 * 9 = 72").toBe(72);
});
