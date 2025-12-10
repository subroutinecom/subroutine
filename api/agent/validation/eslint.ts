import js from "@eslint/js";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import type { ValidationError, ValidationResult } from "./types.ts";

export const validateWithEslint = (code: string): ValidationResult => {
  const linter = new Linter();

  // Define the unique agent config
  // We use tseslint.config to compose the configuration
  const config = tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
    plugins: {
      "agent-demos": {
        rules: {
          "require-validation-log": {
            meta: {
              type: "problem",
              docs: {
                description: "Require a specific log statement at the top",
              },
              schema: [],
            },
            create(context) {
              return {
                Program(node: any) {
                  const firstStatement = node.body[0];
                  const isValidLog =
                    firstStatement &&
                    firstStatement.type === "ExpressionStatement" &&
                    firstStatement.expression.type === "CallExpression" &&
                    firstStatement.expression.callee.type === "MemberExpression" &&
                    firstStatement.expression.callee.object.type === "Identifier" &&
                    firstStatement.expression.callee.object.name === "console" &&
                    firstStatement.expression.callee.property.type === "Identifier" &&
                    firstStatement.expression.callee.property.name === "log" &&
                    firstStatement.expression.arguments.length > 0 &&
                    firstStatement.expression.arguments[0].type === "Literal" &&
                    firstStatement.expression.arguments[0].value === "Validated!";

                  if (!isValidLog) {
                    context.report({
                      node: firstStatement || node,
                      message: "Code must start with console.log('Validated!');",
                    });
                  }
                },
              };
            },
          },
        },
      },
    },
    // Unique rules for the agent
    rules: {
      // Enforce some basic sanity checks but avoid being too pedantic for the agent's generated code
      // unless it's critical.
      "no-empty": "warn",
      "prefer-const": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "agent-demos/require-validation-log": "error",
    },
  });

  // Verify the code against the config
  // Note: linter.verify returns synchronous LintMessage[]
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
