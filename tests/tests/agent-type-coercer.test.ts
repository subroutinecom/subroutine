import { assertEquals, assertExists, assertThrows } from "@std/assert";
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

Deno.test({
  name: "agent type coercer API rejects incompatible input (requires ENABLE_AI_TESTS=true|1)",
  ignore: !enableAiTests,
  fn: async () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });

    const response = await fetch("http://api.subroutine.internal/api/dev/type-coerce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { nickname: "Bob" },
        instructions: "Return only valid JSON.",
        schema: JSON.stringify(zodToJsonSchema(schema)),
        mode: "json",
      }),
    });

    const data = await response.json();

    if (response.status === 400) {
      assertEquals(data.success, false);
      assertExists(data.error);
      return;
    }

    // If the API returned success, ensure the result does NOT satisfy the schema.
    assertEquals(data.success, true);
    const parsed = schema.safeParse(data.value);
    assertEquals(parsed.success, false);
  },
});

Deno.test("zod schema parsing distinguishes object types", () => {
  const schemaA = z.object({
    name: z.string(),
    age: z.number(),
  });

  const schemaB = z.object({
    name: z.string(),
    active: z.boolean(),
  });

  const objA = { name: "Carol", age: 29 };
  const parsedA = schemaA.parse(objA);
  assertEquals(parsedA, objA);

  assertThrows(() => {
    schemaB.parse(objA);
  });
});
