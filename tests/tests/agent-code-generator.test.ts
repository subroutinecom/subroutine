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

    if (response.status === 500 && data.error === "Failed to create coding model") {
      console.log("Skipping test: Failed to create coding model (missing API keys?)");
      return;
    }

    assertEquals(response.status, 200, `Expected 200, got ${response.status}`);
    assertEquals(data.success, true, `Expected true, got ${data.success}`);
    assertExists(data.source, `Expected source to exist, got ${data.source}`);
    assertExists(data.inputsSchema, `Expected inputsSchema to exist, got ${data.inputsSchema}`);
    assertExists(data.outputsSchema, `Expected outputsSchema to exist, got ${data.outputsSchema}`);
  },
});

Deno.test({
  name: `${enableAiTests ? "" : "(requires ENABLE_AI_TESTS=true|1) "}agent core generateCode API with disableExecution=true`,
  ignore: !enableAiTests,
  fn: async () => {
    const API_URL = Deno.env.get("API_URL") || "http://api.subroutine.internal";
    const response = await fetch(`${API_URL}/api/dev/generate-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: "Add 5 and 10 together",
        disableExecution: true,
      }),
    });

    const data = await response.json();

    if (response.status === 500 && data.error === "Failed to create coding model") {
      console.log("Skipping test: Failed to create coding model (missing API keys?)");
      return;
    }

    assertEquals(response.status, 200, `Expected 200, got ${response.status}`);
    assertEquals(data.success, true, `Expected true, got ${data.success}`);
  },
});

Deno.test({
  name: `${enableAiTests ? "" : "(requires ENABLE_AI_TESTS=true|1) "}agent core generateCode API with initial messages (tool calls)`,
  ignore: !enableAiTests,
  fn: async () => {
    const API_URL = Deno.env.get("API_URL") || "http://api.subroutine.internal";
    const INTERNAL_URL = "http://localhost:80";
    const weatherUrl = `${INTERNAL_URL}/mockMCP/weather`;
    const mailUrl = `${INTERNAL_URL}/mockMCP/mail`;

    const requestPayload = {
      request: "Check the weather in Portland, OR (97202) and list my urgent emails.",
      disableExecution: true,
      integrations: [
        {
          id: "mock-weather-server",
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

    assertEquals(
      code.includes('"getForecast"') || code.includes("'getForecast'"),
      true,
      "Expected code to call getForecast tool"
    );
  },
});
