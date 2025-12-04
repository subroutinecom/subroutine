import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { agentRulesPlugin } from "./eslint-rules/index.ts";
import type { ValidationError } from "./types.ts";

export interface LintResult {
  valid: boolean;
  errors: ValidationError[];
}

let eslintInstance: ESLint | null = null;

const getEslint = (): ESLint => {
  if (!eslintInstance) {
    eslintInstance = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          plugins: {
            "agent-rules": agentRulesPlugin as any,
          },
          languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            parser: tseslint.parser,
            parserOptions: {
              ecmaFeatures: { jsx: false },
            },
            globals: {
              console: "readonly",
              Promise: "readonly",
              Array: "readonly",
              Object: "readonly",
              String: "readonly",
              Number: "readonly",
              Boolean: "readonly",
              Date: "readonly",
              JSON: "readonly",
              Math: "readonly",
              Error: "readonly",
              Map: "readonly",
              Set: "readonly",
              WeakMap: "readonly",
              WeakSet: "readonly",
              Symbol: "readonly",
              BigInt: "readonly",
              Intl: "readonly",
              RegExp: "readonly",
              parseInt: "readonly",
              parseFloat: "readonly",
              isNaN: "readonly",
              isFinite: "readonly",
              encodeURI: "readonly",
              decodeURI: "readonly",
              encodeURIComponent: "readonly",
              decodeURIComponent: "readonly",
              setTimeout: "readonly",
              clearTimeout: "readonly",
              setInterval: "readonly",
              clearInterval: "readonly",

              // ours
              integrations: "readonly",
              inputs: "readonly",
            },
          },
          rules: {
            "no-undef": "off",
            "no-unreachable": "error",
            "no-constant-condition": "warn",
            "no-dupe-args": "error",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error",
            "no-empty": "warn",
            "no-ex-assign": "error",
            "no-extra-semi": "warn",
            "no-func-assign": "error",
            "no-invalid-regexp": "error",
            "no-irregular-whitespace": "warn",
            "no-obj-calls": "error",
            "no-sparse-arrays": "warn",
            "no-unexpected-multiline": "error",
            "use-isnan": "error",
            "valid-typeof": "error",

            // Best practices
            "no-fallthrough": "warn",
            "no-redeclare": "error",
            "no-self-assign": "error",
            "no-unused-labels": "warn",

            // Variables
            "no-delete-var": "error",
            "no-shadow-restricted-names": "error",

            // we'll use console.log() for debug logs
            "no-console": "off",

            // Agent rules
            "agent-rules/always-fail-warn": "warn",
          },
        },
      ],
    });
  }
  return eslintInstance;
};

export const lintCode = async (code: string): Promise<LintResult> => {
  const eslint = getEslint();

  const results = await eslint.lintText(code, {
    filePath: "subroutine.ts",
  });

  const errors: ValidationError[] = [];

  for (const result of results) {
    for (const message of result.messages) {
      if (message.severity === 2) {
        errors.push({
          rule: `eslint/${message.ruleId || "unknown"}`,
          message: message.message,
          line: message.line,
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.slice(0, 10),
  };
};

export const resetEslintInstance = (): void => {
  eslintInstance = null;
};
