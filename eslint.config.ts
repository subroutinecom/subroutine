import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

import { localRulesPlugin } from "./eslint/index.ts";

export default defineConfig([
  {
    ignores: ["public/**", ".react-router/**"],
  },

  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: {
      js,
      local: localRulesPlugin,
    },
    extends: ["js/recommended"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: { ...globals.browser, ...globals.node },
    },
  },
  tseslint.configs.recommended,

  {
    rules: {
      "react/prop-types": 0, // we use TS for type checking
      "react/react-in-jsx-scope": 0, // not needed with tsconfig jsx transform

      "no-async-promise-executor": 0,
      "no-empty-pattern": 0,

      "@typescript-eslint/ban-ts-comment": 0,
      "@typescript-eslint/no-empty-object-type": 0,
      "@typescript-eslint/no-explicit-any": 0,
      "@typescript-eslint/no-unused-expressions": 0,
      "@typescript-eslint/no-unused-vars": 0,

      "local/no-anchor-tags": "error",
      "local/no-console-without-text": "error",
      "local/no-routes-imports": "error",
      "local/no-window-session-or-local-storage": "error",
      "local/only-fieldWithInput-mutations": "error",
    },
  },
]);
