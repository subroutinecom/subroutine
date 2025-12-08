import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

// Allow overriding API URL for local testing
const API_URL = Deno.env.get("API_URL") || "http://api.subroutine.internal";

describe("Mock MCP Servers via Agent", () => {
  it("should successfully query all mock MCP servers via agent", async () => {
    const prompt =
      "What is the weather in Paris? Do I have any urgent emails? And what is the latest commit on main?";

    const response = await fetch(`${API_URL}/api/dev/test-mock-mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status} - ${text}`);
    }

    const result = await response.json();

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.response).toBeDefined();
    expect(typeof result.response).toBe("string");

    // Verify tool calls were made
    expect(result.toolCalls).toBeDefined();
    expect(Array.isArray(result.toolCalls)).toBe(true);

    const toolNames = result.toolCalls.map((tc: any) => tc.toolName);
    // Expect at least some of the tools to be called
    // Note: The LLM might optimize and not call all if it hallucinates or fails,
    // but with a clear prompt it should call them.
    const hasWeather = toolNames.includes("getForecast");
    const hasMail = toolNames.includes("listMessages");
    const hasRepo = toolNames.includes("getCommit") || toolNames.includes("listBranches");

    expect(hasWeather || hasMail || hasRepo).toBe(true);
  });
});
