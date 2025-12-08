import { assertEquals, assertExists } from "@std/assert";
import { enableAiTests } from "../fixtures/aitests.ts";

Deno.test({
  name: `${enableAiTests ? "" : "(requires ENABLE_AI_TESTS=true|1) "}agent core generateCode API`,
  ignore: !enableAiTests,
  fn: async () => {
    const API_URL = Deno.env.get("API_URL") || "http://api.subroutine.internal";
    const response = await fetch(`${API_URL}/api/dev/generate-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: "Create a subroutine that takes two numbers, a and b, and returns their sum.",
      }),
    });

    const data = await response.json();

    // If the model fails to create (e.g. missing API keys), we might get a 500
    if (response.status === 500 && data.error === "Failed to create coding model") {
      console.log("Skipping test: Failed to create coding model (missing API keys?)");
      return;
    }

    assertEquals(response.status, 200, `Expected 200, got ${response.status}`);
    assertEquals(data.success, true, `Expected true, got ${data.success}`);
    assertExists(data.source, `Expected source to exist, got ${data.source}`);
    assertExists(data.inputsSchema, `Expected inputsSchema to exist, got ${data.inputsSchema}`);
    assertExists(data.outputsSchema, `Expected outputsSchema to exist, got ${data.outputsSchema}`);

    // Basic validation of the generated code
    const code = data.source;
    assertEquals(
      code.includes("export const main") || code.includes("export async function main"),
      true,
      `Expected code to include "export const main", got ${code}`
    );
    // Ideally it should have types defined
    assertEquals(
      code.includes("type Inputs"),
      true,
      `Expected code to include "type Inputs", got ${code}`
    );
    assertEquals(
      code.includes("type Outputs"),
      true,
      `Expected code to include "type Outputs", got ${code}`
    );
  },
});

Deno.test({
  name: `${enableAiTests ? "" : "(requires ENABLE_AI_TESTS=true|1) "}agent core generateCode API with immediate inputs`,
  ignore: !enableAiTests,
  fn: async () => {
    const API_URL = Deno.env.get("API_URL") || "http://api.subroutine.internal";
    const response = await fetch(`${API_URL}/api/dev/generate-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: "Add 5 and 10 together",
        needsImmediateInputs: true,
      }),
    });

    const data = await response.json();

    if (response.status === 500 && data.error === "Failed to create coding model") {
      console.log("Skipping test: Failed to create coding model (missing API keys?)");
      return;
    }

    assertEquals(response.status, 200, `Expected 200, got ${response.status}`);
    assertEquals(data.success, true, `Expected true, got ${data.success}`);
    assertExists(
      data.immediateInputs,
      `Expected immediateInputs to exist, got ${data.immediateInputs}`
    );

    // Check if inputs match what we asked for
    const inputs = data.immediateInputs;
    // The keys might vary, but values should likely be 5 and 10
    const values = Object.values(inputs);
    assertEquals(values.includes(5), true, `Expected 5 to be in values, got ${values}`);
    assertEquals(values.includes(10), true, `Expected 10 to be in values, got ${values}`);
  },
});

Deno.test({
  name: `${enableAiTests ? "" : "(requires ENABLE_AI_TESTS=true|1) "}agent core generateCode API with initial messages (conversation history)`,
  ignore: !enableAiTests,
  fn: async () => {
    const API_URL = Deno.env.get("API_URL") || "http://api.subroutine.internal";
    const response = await fetch(`${API_URL}/api/dev/generate-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: "Create a subroutine that returns the value of secret_value",
        initialMessages: [
          { role: "user", content: "I have a secret value called secret_value which is 42." },
          { role: "assistant", content: "Okay, I will remember that secret_value is 42." },
        ],
        needsImmediateInputs: true,
      }),
    });

    const data = await response.json();

    if (response.status === 500 && data.error === "Failed to create coding model") {
      console.log("Skipping test: Failed to create coding model (missing API keys?)");
      return;
    }

    assertEquals(response.status, 200, `Expected 200, got ${response.status}`);
    assertEquals(data.success, true, `Expected true, got ${data.success}`);

    // The agent should have generated code that returns 42, likely as a default value or hardcoded
    const code = data.source;
    console.log("Generated code:", code);

    // We expect the code to reference 42 or the input to default to 42
    // Or simpler: check if immediateInputs has 42 if it decided to make it an input (less likely if hardcoded)
    // Or if the code body contains 42.

    // It's tricky to assert EXACTLY what the LLM does, but it should mention 42.
    assertEquals(
      code.includes("42"),
      true,
      `Expected code to include "42" from history, got ${code}`
    );
  },
});

Deno.test.only({
  name: `${enableAiTests ? "" : "(requires ENABLE_AI_TESTS=true|1) "}agent core generateCode API with initial messages (tool calls)`,
  ignore: !enableAiTests,
  fn: async () => {
    // 1. Define available integrations (simulating provided mode)
    // Use env var to point to localhost:3002 when running locally, or default to internal dns for container
    const API_URL = Deno.env.get("API_URL") || "http://api.subroutine.internal";

    // The internal URL is how the agent (inside container) reaches the mock servers (also inside container)
    // Using localhost:80 works because they are in the same `api` service.
    const INTERNAL_URL = "http://localhost:80";

    // The mock servers are mounted at /mockMCP/weather etc.
    const weatherUrl = `${INTERNAL_URL}/mockMCP/weather`;
    const mailUrl = `${INTERNAL_URL}/mockMCP/mail`;

    const requestPayload = {
      request: "Check the weather in Portland, OR (97202) and list my urgent emails.",
      needsImmediateInputs: true,
      integrations: [
        {
          id: "mock-weather-server", // Must match what we expect in code
          name: "mock-weather-server",
          type: "mcp",
          connectionUrl: weatherUrl,
        },
        {
          id: "mock-mail-server",
          name: "mock-mail-server",
          type: "mcp",
          connectionUrl: mailUrl,
        },
      ],
      mcpContext: {
        organizationId: "org_mock",
        viewerId: "user_mock",
        integrationNameToId: {
          "mock-weather-server": "mock-weather-server",
          "mock-mail-server": "mock-mail-server",
        },
      },
    };

    console.log(`Sending request to ${API_URL}/api/dev/generate-code...`);
    const response = await fetch(`${API_URL}/api/dev/generate-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });

    const data = await response.json();

    if (response.status === 500 && data.error === "Failed to create coding model") {
      console.log("Skipping test: Failed to create coding model (missing API keys?)");
      return;
    }

    assertEquals(
      response.status,
      200,
      `Expected 200, got ${response.status} - ${JSON.stringify(data.error)}`
    );
    assertEquals(data.success, true, `Expected true, got ${data.success}`);

    // If the agent actually used the tools, it must have taken more than 1 step (inpsect -> write)
    console.log(`Agent iterations: ${data.iterations}`);
    assertEquals(
      data.iterations > 1,
      true,
      `Expected > 1 iterations (inspect -> code), got ${data.iterations}`
    );

    const code = data.source;
    console.log("=========================================");
    console.log("GENERATED CODE WITH MOCKS:");
    console.log(code);
    console.log("=========================================");

    // Verify usage
    assertEquals(
      code.includes('getMcpClient("mock-weather-server")'),
      true,
      'Expected code to use getMcpClient("mock-weather-server")'
    );
    assertEquals(
      code.includes('getMcpClient("mock-mail-server")'),
      true,
      'Expected code to use getMcpClient("mock-mail-server")'
    );

    // It should call tools
    assertEquals(
      code.includes('"getForecast"') || code.includes("'getForecast'"),
      true,
      "Expected code to call getForecast tool"
    );
  },
});
