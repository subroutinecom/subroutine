import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";

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

// Wait for services to be fully ready
await new Promise((resolve) => setTimeout(resolve, 5000));

Deno.test("admin-panel health check", async () => {
  const response = await makeRequest({
    hostname: "api",
    path: "/status",
    method: "GET",
  });

  assertEquals(response.status, 200, "Server should return 200 status");
  const data = JSON.parse(response.data);
  assertEquals(data.status, "ok", "Server should return ok status");
});

Deno.test("create subroutine via REST API", async () => {
  const response = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({
      request: "Create a function that adds two numbers",
    })
  );

  assertEquals(response.status, 201, "Should return 201 Created");

  const data = JSON.parse(response.data);
  const subroutine: Subroutine = data.subroutine;
  assertEquals(typeof subroutine.id, "string", "Should have an ID");
  assertEquals(typeof subroutine.source, "string", "Should have source code");
  assertEquals(subroutine.createdFrom.request, "Create a function that adds two numbers");
  assertEquals(typeof subroutine.createdAt, "string", "Should have createdAt timestamp");
  assertEquals(typeof data.subroutineUri, "string", "Should have subroutineUri");
});

Deno.test("get specific subroutine by ID", async () => {
  // First create a subroutine
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Test subroutine for retrieval" })
  );

  const createData = JSON.parse(createResponse.data);
  const created: Subroutine = createData.subroutine;

  // Then retrieve it
  const getResponse = await makeRequest({
    hostname: "api",
    path: `/api/subroutines/${created.id}`,
    method: "GET",
  });

  assertEquals(getResponse.status, 200, "Should return 200 OK");

  const getData = JSON.parse(getResponse.data);
  const retrieved: Subroutine = getData.subroutine;
  assertEquals(retrieved.id, created.id, "Should return same subroutine");
  assertEquals(retrieved.createdFrom.request, "Test subroutine for retrieval");
});

Deno.test("list all subroutines", async () => {
  // Create at least one subroutine
  await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Test subroutine for listing" })
  );

  // List all subroutines
  const response = await makeRequest({
    hostname: "api",
    path: "/api/subroutines",
    method: "GET",
  });

  assertEquals(response.status, 200, "Should return 200 OK");

  const data = JSON.parse(response.data);
  const subroutines: Subroutine[] = data.subroutines;
  assertEquals(Array.isArray(subroutines), true, "Should return an array");
  assertEquals(subroutines.length > 0, true, "Should have at least one subroutine");
});

Deno.test("run a subroutine", async () => {
  // First create a subroutine
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Test subroutine for execution" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  assertExists(subroutine?.id, "Subroutine should have been created");

  // Then run it
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  assertEquals(runResponse.status, 201, "Should return 201 Created");

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;
  assertEquals(typeof run.id, "string", "Run should have an ID");
  assertEquals(run.subroutineId, subroutine.id, "Run should reference the subroutine");
  assertEquals(["queued", "running", "succeeded"].includes(run.status), true, "Run should have valid status");
  assertEquals(typeof runData.runUri, "string", "Should have runUri");
});

Deno.test("get run status and wait for completion", async () => {
  // Create and run a subroutine
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Test subroutine for run status" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  assertExists(subroutine?.id, "Subroutine should have been created");

  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  });

  assertEquals(statusResponse.status, 200, "Should return 200 OK");

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;
  assertEquals(completedRun.status, "succeeded", "Run should be completed");
  assertEquals(typeof completedRun.startedAt, "string", "Should have startedAt timestamp");
  assertEquals(typeof completedRun.endedAt, "string", "Should have endedAt timestamp");
  assertEquals(completedRun.outputs !== null, true, "Should have outputs");
});

Deno.test("list all runs", async () => {
  // Create and run a subroutine to ensure there's at least one run
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Test subroutine for run listing" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  assertExists(subroutine?.id, "Subroutine should have been created");

  await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  // List all runs
  const response = await makeRequest({
    hostname: "api",
    path: "/api/runs",
    method: "GET",
  });

  assertEquals(response.status, 200, "Should return 200 OK");

  const data = JSON.parse(response.data);
  const runs: Run[] = data.runs;
  assertEquals(Array.isArray(runs), true, "Should return an array");
  assertEquals(runs.length > 0, true, "Should have at least one run");
});

Deno.test("get non-existent subroutine returns 404", async () => {
  const response = await makeRequest({
    hostname: "api",
    path: "/api/subroutines/non-existent-id",
    method: "GET",
  });

  assertEquals(response.status, 404, "Should return 404 Not Found");
  const errorData = JSON.parse(response.data);
  assertEquals(typeof errorData.error, "object", "Should have error object");
  assertEquals(typeof errorData.error.message, "string", "Should have error message");
});

Deno.test("run non-existent subroutine returns 404", async () => {
  const response = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines/non-existent-id/run",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  assertEquals(response.status, 404, "Should return 404 Not Found");
  const errorData = JSON.parse(response.data);
  assertEquals(typeof errorData.error, "object", "Should have error object");
  assertEquals(typeof errorData.error.message, "string", "Should have error message");
});

Deno.test("get non-existent run returns 404", async () => {
  const response = await makeRequest({
    hostname: "api",
    path: "/api/runs/non-existent-id",
    method: "GET",
  });

  assertEquals(response.status, 404, "Should return 404 Not Found");
  const errorData = JSON.parse(response.data);
  assertEquals(typeof errorData.error, "object", "Should have error object");
  assertEquals(typeof errorData.error.message, "string", "Should have error message");
});

Deno.test("create subroutine without request field returns 400", async () => {
  const response = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({})
  ); // Missing 'request' field

  assertEquals(response.status, 400, "Should return 400 Bad Request");
  const errorData = JSON.parse(response.data);
  assertEquals(typeof errorData.error, "object", "Should have error object");
  assertEquals(typeof errorData.error.message, "string", "Should have error message");
  assertStringIncludes(errorData.error.message, "request", "Error should mention missing request field");
});

Deno.test("create multiple subroutines have unique IDs", async () => {
  const response1 = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "First subroutine" })
  );

  const response2 = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Second subroutine" })
  );

  const data1 = JSON.parse(response1.data);
  const data2 = JSON.parse(response2.data);
  const sub1: Subroutine = data1.subroutine;
  const sub2: Subroutine = data2.subroutine;

  assertEquals(sub1.id !== sub2.id, true, "Subroutines should have unique IDs");
});

Deno.test("multiple runs of same subroutine have unique IDs", async () => {
  // Create a subroutine
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Test subroutine for multiple runs" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  assertExists(subroutine?.id, "Subroutine should have been created");

  // Run it twice
  const run1Response = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  const run2Response = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ inputs: {} })
  );

  const run1Data = JSON.parse(run1Response.data);
  const run2Data = JSON.parse(run2Response.data);
  const run1: Run = run1Data.run;
  const run2: Run = run2Data.run;

  assertEquals(run1.id !== run2.id, true, "Runs should have unique IDs");
  assertEquals(run1.subroutineId, subroutine.id, "Both runs should reference same subroutine");
  assertEquals(run2.subroutineId, subroutine.id, "Both runs should reference same subroutine");
});

// ========================================
// SANDBOX EXECUTION TESTS
// ========================================

Deno.test("subroutine actually executes addition in sandbox", async () => {
  // Create a subroutine that adds numbers
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Create a function that adds two numbers" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  assertExists(subroutine?.id, "Subroutine should have been created");

  // Verify the generated code includes addition logic
  assertStringIncludes(subroutine.source, "add", "Generated code should mention addition");

  // Run it with custom inputs
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  });

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;

  assertEquals(completedRun.status, "succeeded", "Run should succeed");
  assertEquals(completedRun.outputs !== null, true, "Should have outputs");
  assertEquals((completedRun.outputs as Record<string, unknown>)?.result, 42, "Should compute 15 + 27 = 42");
});

Deno.test("subroutine executes fibonacci in sandbox", async () => {
  // Create a subroutine that generates fibonacci sequence
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Generate fibonacci sequence" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  assertExists(subroutine?.id, "Subroutine should have been created");

  // Run it
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  });

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;

  assertEquals(completedRun.status, "succeeded", "Run should succeed");
  const outputs = completedRun.outputs as Record<string, unknown>;
  const sequence = outputs?.sequence as number[];
  assertEquals(Array.isArray(sequence), true, "Should return an array");
  assertEquals(sequence[0], 0, "First fibonacci number should be 0");
  assertEquals(sequence[1], 1, "Second fibonacci number should be 1");
  assertEquals(sequence[7], 13, "8th fibonacci number should be 13");
});

Deno.test("subroutine with string reversal executes correctly", async () => {
  // Create a subroutine that reverses strings
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Reverse a string" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  assertExists(subroutine?.id, "Subroutine should have been created");

  // Run it with custom text
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  });

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;

  assertEquals(completedRun.status, "succeeded", "Run should succeed");
  const outputs = completedRun.outputs as Record<string, unknown>;
  assertEquals(outputs?.reversed, "tpircSepyT", "Should reverse 'TypeScript' to 'tpircSepyT'");
});

Deno.test("default hello world with custom name input", async () => {
  // Create a generic subroutine (should use default hello world)
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Say hello" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  assertExists(subroutine?.id, "Subroutine should have been created");

  // Run with custom name
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  });

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;

  assertEquals(completedRun.status, "succeeded", "Run should succeed");
  const outputs = completedRun.outputs as Record<string, unknown>;
  assertEquals(outputs?.message, "Hello, Sandbox!", "Should greet with custom name");
  assertEquals(typeof outputs?.timestamp, "string", "Should have timestamp");
});

Deno.test("multiplication subroutine executes correctly", async () => {
  // Create a subroutine that multiplies numbers
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutines",
      method: "POST",
      headers: { "Content-Type": "application/json" },
    },
    JSON.stringify({ request: "Multiply two numbers" })
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  assertExists(subroutine?.id, "Subroutine should have been created");

  // Run with custom inputs
  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutines/${subroutine.id}/run`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  });

  const statusData = JSON.parse(statusResponse.data);
  const completedRun: Run = statusData.run;

  assertEquals(completedRun.status, "succeeded", "Run should succeed");
  const outputs = completedRun.outputs as Record<string, unknown>;
  assertEquals(outputs?.result, 72, "Should compute 8 * 9 = 72");
});
