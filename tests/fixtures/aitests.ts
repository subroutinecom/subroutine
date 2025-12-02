export const enableAiTests = (() =>
  ["1", "true"].indexOf(Deno.env.get("ENABLE_AI_TESTS") ?? "") !== -1)();
