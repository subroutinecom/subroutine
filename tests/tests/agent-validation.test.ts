import { assertEquals } from "@std/assert";
import type { ValidationResult } from "../../api/agent/validation/types.ts";

const validateCodeViaApi = async (code: string): Promise<ValidationResult> => {
  const response = await fetch("http://api.subroutine.internal/tests/validate-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}: ${await response.text()}`);
  }

  return await response.json();
};

Deno.test("Validator - ESLint Check (main-must-be-async)", async () => {
  const invalidCode = `
    export type Inputs = {};
    export type Outputs = {};
    export function main() {
        return {};
    }
  `;

  const result = await validateCodeViaApi(invalidCode);
  const error = result.errors.find((e) => e.rule === "agent/main-must-be-async");
  if (!error) {
    console.log("Errors found:", JSON.stringify(result.errors, null, 2));
    throw new Error("Expected agent/main-must-be-async error not found");
  }
  assertEquals(error.message, "The main function must be async");
});

Deno.test("Validator - Valid Code", async () => {
  const validCode = `
      export type Inputs = {};
      export type Outputs = {};
      export const main = async (inputs: Inputs) => {
          return { message: "Hello" };
      };
    `;

  const result = await validateCodeViaApi(validCode);

  // Filter for agent errors only (ignore potential standard eslint warnings like unused vars)
  const errors = result.errors.filter((e) => e.rule.startsWith("agent/"));
  assertEquals(
    errors.length,
    0,
    `Should have no agent validation errors: ${JSON.stringify(errors)}`
  );
});
