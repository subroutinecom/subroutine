import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

import { localRulesPlugin } from "./eslint/index.ts";

export default tseslint.config([
  {
    ignores: [
      "**/public/**",
      "**/.react-router/**",
      "**/.vite/**",
      "**/ecosystem.config.js",
      "**/build/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    plugins: {
      local: localRulesPlugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: { ...globals.browser, ...globals.node },
    },
  },

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

      "local/no-routes-imports": "error",
      "local/no-window-session-or-local-storage": "error",
      "local/only-fieldWithInput-mutations": "error",
    },
  },
  {
    files: ["api/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    rules: {
      "local/no-console": "error",
      "local/logger-name-match": "error",
      "local/logger-arg-pattern": "error",
      "local/no-better-auth-logger": "error",
    },
  },
]);
