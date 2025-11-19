import { expect } from "@std/expect";
import { it } from "@std/testing/bdd";
import { makeRequest } from "../fixtures/request.ts";

interface Subroutine {
  id: string;
  organizationId: string;
  integrationIds: string[];
  source: string;
  inputsSchema?: Record<string, unknown>;
  outputsSchema?: Record<string, unknown>;
  initialInputs?: Record<string, unknown>;
  createdFrom: { request: string };
  createdAt: string;
}

interface Run {
  id: string;
  organizationId: string;
  subroutineId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  startedAt?: string | null;
  endedAt?: string | null;
  outputs?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
}

const MOCK_HEADERS: HeadersInit = { "x-use-mock": "true" };
const VIEWER_ID = "viewer-123";

async function pollRunCompletion(runId: string, maxAttempts = 40, intervalMs = 50): Promise<Run> {
  for (let i = 0; i < maxAttempts; i++) {
    const statusResponse = await makeRequest({
      hostname: "api",
      path: `/api/run/${runId}`,
      method: "GET",
      headers: MOCK_HEADERS,
    });
    const status: { run: Run } = JSON.parse(statusResponse.data);
    if (status.run.status !== "queued" && status.run.status !== "running") {
      return status.run;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Run ${runId} did not complete after ${maxAttempts * intervalMs}ms`);
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
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({
      useMock: true,
      request: "Create a function that adds two numbers",
      integrations: [],
    }),
  );

  expect(response.status, "Should return 201 Created").toBe(201);

  const data = JSON.parse(response.data);
  const subroutine: Subroutine = data.subroutine;
  expect(typeof subroutine.id, "Should have an ID").toBe("string");
  expect(subroutine.integrationIds, "Should include integrations array").toBeDefined();
  expect(Array.isArray(subroutine.integrationIds), "integrationIds should be array").toBe(true);
  expect(typeof subroutine.source, "Should have source code").toBe("string");
  expect(subroutine.createdFrom.request, "Should retain original request").toBe(
    "Create a function that adds two numbers",
  );
  expect(typeof subroutine.createdAt, "Should have createdAt timestamp").toBe("string");
  expect(typeof data.subroutineUri, "Should have subroutineUri").toBe("string");
});

it("get specific subroutine by ID", async () => {
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Test subroutine for retrieval" }),
  );

  const createData = JSON.parse(createResponse.data);
  const created: Subroutine = createData.subroutine;

  const getResponse = await makeRequest({
    hostname: "api",
    path: `/api/subroutine/${created.id}`,
    method: "GET",
    headers: MOCK_HEADERS,
  });

  expect(getResponse.status, "Should return 200 OK").toBe(200);

  const getData = JSON.parse(getResponse.data);
  const retrieved: Subroutine = getData.subroutine;
  expect(retrieved.id, "Should return same subroutine").toBe(created.id);
  expect(retrieved.createdFrom.request, "Should preserve createdFrom.request").toBe(
    "Test subroutine for retrieval",
  );
});

it("list all subroutines", async () => {
  await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Test subroutine for listing" }),
  );

  const response = await makeRequest({
    hostname: "api",
    path: "/api/subroutine",
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
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Test subroutine for execution" }),
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutine/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: {} }),
  );

  expect(runResponse.status, "Should return 201 Created").toBe(201);

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;
  expect(typeof run.id, "Run should have an ID").toBe("string");
  expect(run.subroutineId, "Run should reference the subroutine").toBe(subroutine.id);
  expect(["queued", "running", "succeeded"].includes(run.status), "Run should have valid status")
    .toBe(true);
  expect(typeof runData.runUri, "Should have runUri").toBe("string");
});

it("execute request to create and run a subroutine", async () => {
  const response = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine/execute_request",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({
      request: "Create a function that multiplies two numbers",
      viewerId: VIEWER_ID,
    }),
  );

  expect(response.status, "Should return 201 Created").toBe(201);

  const data = JSON.parse(response.data);
  const subroutine: Subroutine = data.subroutine;
  const run: Run = data.run;

  expect(typeof subroutine?.id, "Should create a subroutine").toBe("string");
  expect(typeof data.subroutineUri, "Response should include subroutineUri").toBe("string");
  expect(typeof run?.id, "Should create a run").toBe("string");
  expect(run.subroutineId, "Run should reference the created subroutine").toBe(subroutine.id);
  expect(typeof data.runUri, "Response should include runUri").toBe("string");
  expect(subroutine.initialInputs, "Subroutine should include initial inputs").toBeDefined();
  expect(typeof data.initialInputs, "Response should include initial inputs").toBe("object");
});

it("get run status and wait for completion", async () => {
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({
      useMock: true,
      request: "Test subroutine for run status",
    }),
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutine/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: {} }),
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  const completedRun = await pollRunCompletion(run.id);

  expect(completedRun.status, "Run should be completed").toBe("succeeded");
  expect(typeof completedRun.startedAt, "Should have startedAt timestamp").toBe("string");
  expect(typeof completedRun.endedAt, "Should have endedAt timestamp").toBe("string");
  expect(completedRun.outputs !== null, "Should have outputs").toBe(true);
});

it("list all runs", async () => {
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({
      useMock: true,
      request: "Test subroutine for run listing",
    }),
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutine/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: {} }),
  );

  const response = await makeRequest({
    hostname: "api",
    path: "/api/run",
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
    path: "/api/subroutine/non-existent-id",
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
      path: "/api/subroutine/non-existent-id/run",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: {} }),
  );

  expect(response.status, "Should return 404 Not Found").toBe(404);
  const errorData = JSON.parse(response.data);
  expect(typeof errorData.error, "Should have error object").toBe("object");
  expect(typeof errorData.error.message, "Should have error message").toBe("string");
});

it("get non-existent run returns 404", async () => {
  const response = await makeRequest({
    hostname: "api",
    path: "/api/run/non-existent-id",
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
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true }),
  );

  expect(response.status, "Should return 400 Bad Request").toBe(400);
  const errorData = JSON.parse(response.data);
  expect(typeof errorData.error, "Should have error object").toBe("object");
  expect(typeof errorData.error.message, "Should have error message").toBe("string");
  expect(errorData.error.message, "Error should mention missing request field").toContain(
    "request",
  );
});

it("create multiple subroutines have unique IDs", async () => {
  const response1 = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "First subroutine" }),
  );

  const response2 = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Second subroutine" }),
  );

  const data1 = JSON.parse(response1.data);
  const data2 = JSON.parse(response2.data);
  const sub1: Subroutine = data1.subroutine;
  const sub2: Subroutine = data2.subroutine;

  expect(sub1.id !== sub2.id, "Subroutines should have unique IDs").toBe(true);
});

it("multiple runs of same subroutine have unique IDs", async () => {
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({
      useMock: true,
      request: "Test subroutine for multiple runs",
    }),
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  const run1Response = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutine/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: {} }),
  );

  const run2Response = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutine/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: {} }),
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
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({
      useMock: true,
      request: "Create a function that adds two numbers",
    }),
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  expect(subroutine.source, "Generated code should mention addition").toContain("add");

  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutine/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: { a: 15, b: 27 } }),
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  const completedRun = await pollRunCompletion(run.id);

  expect(completedRun.status, "Run should succeed").toBe("succeeded");
  expect(completedRun.outputs !== null, "Should have outputs").toBe(true);
  expect((completedRun.outputs as Record<string, unknown>)?.result, "Should compute 15 + 27 = 42")
    .toBe(42);
});

it("subroutine executes fibonacci in sandbox", async () => {
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Generate fibonacci sequence" }),
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutine/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: { n: 8 } }),
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  const completedRun = await pollRunCompletion(run.id);

  expect(completedRun.status, "Run should succeed").toBe("succeeded");
  const outputs = completedRun.outputs as Record<string, unknown>;
  const sequence = outputs?.sequence as number[];
  expect(Array.isArray(sequence), "Should return an array").toBe(true);
  expect(sequence[0], "First fibonacci number should be 0").toBe(0);
  expect(sequence[1], "Second fibonacci number should be 1").toBe(1);
  expect(sequence[7], "8th fibonacci number should be 13").toBe(13);
});

it("subroutine with string reversal executes correctly", async () => {
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Reverse a string" }),
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutine/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: { text: "TypeScript" } }),
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  const completedRun = await pollRunCompletion(run.id);

  expect(completedRun.status, "Run should succeed").toBe("succeeded");
  const outputs = completedRun.outputs as Record<string, unknown>;
  expect(outputs?.reversed, "Should reverse 'TypeScript' to 'tpircSepyT'").toBe("tpircSepyT");
});

it("default hello world with custom name input", async () => {
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Say hello" }),
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutine/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: { name: "Sandbox" } }),
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  const completedRun = await pollRunCompletion(run.id);

  expect(completedRun.status, "Run should succeed").toBe("succeeded");
  const outputs = completedRun.outputs as Record<string, unknown>;
  expect(outputs?.message, "Should greet with custom name").toBe("Hello, Sandbox!");
  expect(typeof outputs?.timestamp, "Should have timestamp").toBe("string");
});

it("multiplication subroutine executes correctly", async () => {
  const createResponse = await makeRequest(
    {
      hostname: "api",
      path: "/api/subroutine",
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ useMock: true, request: "Multiply two numbers" }),
  );

  const createData = JSON.parse(createResponse.data);
  const subroutine: Subroutine = createData.subroutine;
  expect(subroutine?.id, "Subroutine should have been created").toBeDefined();

  const runResponse = await makeRequest(
    {
      hostname: "api",
      path: `/api/subroutine/${subroutine.id}/run`,
      method: "POST",
      headers: { ...MOCK_HEADERS, "Content-Type": "application/json" },
    },
    JSON.stringify({ viewerId: VIEWER_ID, inputs: { a: 8, b: 9 } }),
  );

  const runData = JSON.parse(runResponse.data);
  const run: Run = runData.run;

  const completedRun = await pollRunCompletion(run.id);

  expect(completedRun.status, "Run should succeed").toBe("succeeded");
  const outputs = completedRun.outputs as Record<string, unknown>;
  expect(outputs?.result, "Should compute 8 * 9 = 72").toBe(72);
});
