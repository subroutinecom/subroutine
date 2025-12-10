import js from "@eslint/js";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { rules as agentRules } from "./eslint-rules/index.ts";
import type { ValidationContext, ValidationError, ValidationResult } from "./types.ts";

export const validateWithEslint = (code: string, context?: ValidationContext): ValidationResult => {
  // @ts-ignore - configType option is valid in ESLint 9 but types might be lagging or strict
  const linter = new Linter({ configType: "flat" });

  // Define the unique agent config
  const config = tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
    plugins: {
      agent: {
        rules: agentRules,
      },
    },
    settings: {
      agentValidation: context,
    },
    // Unique rules for the agent
    rules: {
      // Enforce some basic sanity checks but avoid being too pedantic for the agent's generated code
      // unless it's critical.
      "no-empty": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",

      // Agent specific validation rules
      "agent/await-mcp-client": "error",
      "agent/main-must-be-async": "error",
      "agent/main-must-be-exported": "error",
      "agent/main-must-return-outputs": "error",
      "agent/must-define-inputs-type": "error",
      "agent/must-define-outputs-type": "error",
      "agent/no-ctx-param": "error",
      "agent/no-nested-imports": "error",
      "agent/no-network-fetch": "error",
      "agent/only-allow-standard-integrations-methods": "error",
      "agent/validate-graphql-queries": "error",
      "agent/validate-openapi-calls": "error",
      "agent/verify-integration-names-exist": "error",
    },
  });

  // Verify the code against the config
  const messages = linter.verify(code, config as any);

  const errors: ValidationError[] = messages.map((msg) => ({
    rule: msg.ruleId || "eslint",
    message: msg.message,
    line: msg.line,
    column: msg.column,
  }));

  return {
    valid: errors.length === 0,
    errors,
  };
};
