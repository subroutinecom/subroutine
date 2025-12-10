import { expect } from "@std/expect";
import type { Integrations } from "@subroutine/integration-types";

// 1. Define the Shape
const TestShape = {
  "weather-server": {
    getForecast: {
      inputSchema: {
        type: "object",
        properties: {
          city: { type: "string" },
          days: { type: "number" },
        },
        required: ["city"],
        additionalProperties: false,
      } as const,
    },
  },
} as const;

// 2. Mock Implementation
class MockIntegrations implements Integrations<{ mcp: typeof TestShape }> {
  async getMcpClient<S extends keyof typeof TestShape>(_name: S): Promise<any> {
    return {
      callTool: async (args: any) => {
        return { content: [{ type: "text", text: `Forecast for ${args.arguments.city}` }] };
      },
      listTools: async () => ({ tools: [] }),
      listResources: async () => ({ resources: [] }),
      readResource: async () => ({ contents: [] }),
      listPrompts: async () => ({ prompts: [] }),
      getPrompt: async () => ({ messages: [] }),
    };
  }

  // Implement other required methods with stubs
  getGmail = async () => ({}) as any;
  getCalendar = async () => ({}) as any;
  getS3 = async () => ({}) as any;
  getGithub = async () => ({}) as any;
  getPing = async () => ({}) as any;
  getGraphQLClient = async () => ({}) as any;
  getOpenAPIClient = async () => ({}) as any;
}

Deno.test("Integrations Generic Type Safety", async () => {
  const integrations = new MockIntegrations();
  const client = await integrations.getMcpClient("weather-server");

  // Valid Call
  const result = await client.callTool({
    name: "getForecast",
    arguments: {
      city: "London",
      days: 5,
    },
  });

  expect(result.content[0].text).toBe("Forecast for London");

  // Invalid Call (Uncommenting this should cause type error)
  // await client.callTool({
  //   name: "getForecast",
  //   arguments: {
  //     city: 123, // Error: Type 'number' is not assignable to type 'string'
  //   }
  // });
});
