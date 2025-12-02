import { assertEquals } from "@std/assert";

const enableAiTests = (Deno.env.get("ENABLE_AI_TESTS") ?? "").toLowerCase() === "true";

Deno.test({
  name: "agent type coercer placeholder (requires ENABLE_AI_TESTS=true)",
  ignore: !enableAiTests,
  fn: () => {
    assertEquals(true, true);
  },
});
