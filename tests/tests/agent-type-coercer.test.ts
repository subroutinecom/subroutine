import { assertEquals, assertExists } from "@std/assert";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { enableAiTests } from "../fixtures/aitests.ts";

Deno.test({
  name: "agent type coercer API (requires ENABLE_AI_TESTS=true|1)",
  ignore: !enableAiTests,
  fn: async () => {
    const personSchema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const response = await fetch("http://api.subroutine.internal/api/dev/type-coerce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { name: "Alice", age: "32" },
        instructions: "Coerce the input to match the schema exactly.",
        schema: JSON.stringify(zodToJsonSchema(personSchema)),
        mode: "json",
      }),
    });

    const data = await response.json();

    assertEquals(response.status, 200);
    assertEquals(data.success, true);
    assertExists(data.value);

    const parsed = personSchema.parse(data.value);
    assertEquals(typeof parsed.name, "string");
    assertEquals(typeof parsed.age, "number");
  },
});
