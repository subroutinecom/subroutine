import { assertEquals } from "@std/assert";

const enableAiTests = (() => ["1", "true"].indexOf(Deno.env.get("ENABLE_AI_TESTS") ?? "") !== -1)();
Deno.test({
  name: "agent type coercer placeholder (requires ENABLE_AI_TESTS=true|1)",
  ignore: !enableAiTests,
  fn: () => {
    assertEquals(true, true);
  },
});
