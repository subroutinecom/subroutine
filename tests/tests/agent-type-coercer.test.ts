import { assertEquals } from "@std/assert";
import { enableAiTests } from "../fixtures/aitests.ts";

Deno.test({
  name: "agent type coercer placeholder (requires ENABLE_AI_TESTS=true|1)",
  ignore: !enableAiTests,
  fn: () => {
    assertEquals(true, true);
  },
});
