import { assertEquals, assertExists } from "@std/assert";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { enableAiTests } from "../fixtures/aitests.ts";

Deno.test({
  name: `${enableAiTests ? "" : "(requires ENABLE_AI_TESTS=true|1) "}agent input formatter API`,
  ignore: !enableAiTests,
  fn: async () => {
    const argsSchema = z.object({
      x: z.coerce.number(),
      y: z.coerce.number(),
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
    });

    const response = await fetch("http://api.subroutine.internal/api/dev/input-format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: "Please add 10 and 5.",
        schema: JSON.stringify(zodToJsonSchema(argsSchema)),
        mode: "tool",
      }),
    });

    const data = await response.json();

    assertEquals(response.status, 200);
    assertEquals(data.success, true);
    assertExists(data.value);

    const parsed = argsSchema.parse(data.value);
    assertEquals(parsed.x, 10);
    assertEquals(parsed.y, 5);
    assertEquals(parsed.operation, "add");
  },
});

Deno.test({
  name: `${enableAiTests ? "" : "(requires ENABLE_AI_TESTS=true|1) "}agent input formatter API handles complex parsing`,
  ignore: !enableAiTests,
  fn: async () => {
    const argsSchema = z.object({
      query: z.string(),
      filters: z.array(z.string()).optional(),
      limit: z.number().optional(),
    });

    const response = await fetch("http://api.subroutine.internal/api/dev/input-format", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: "Search for 'error logs' in the last 24 hours, but only show me 10 results.",
        schema: JSON.stringify(zodToJsonSchema(argsSchema)),
        mode: "tool",
      }),
    });

    const data = await response.json();

    assertEquals(response.status, 200);
    assertEquals(data.success, true);
    const parsed = argsSchema.parse(data.value);

    assertEquals(parsed.query, "error logs");
    assertEquals(parsed.limit, 10);
  },
});
