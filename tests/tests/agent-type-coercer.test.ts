import { assertEquals, assertExists } from "@std/assert";
import { enableAiTests } from "../fixtures/aitests.ts";

Deno.test({
  name: "agent type coercer API (requires ENABLE_AI_TESTS=true|1)",
  ignore: !enableAiTests,
  fn: async () => {
    const response = await fetch("http://api.subroutine.internal/api/dev/type-coerce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { name: "Alice", age: "32" },
        instructions: "Coerce the input to match the schema exactly.",
        schema: JSON.stringify({
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "integer" },
          },
          required: ["name", "age"],
          additionalProperties: false,
        }),
        mode: "json",
      }),
    });

    const data = await response.json();

    assertEquals(response.status, 200);
    assertEquals(data.success, true);
    assertExists(data.value);
    assertEquals(typeof data.value.name, "string");
    assertEquals(typeof data.value.age, "number");
  },
});
