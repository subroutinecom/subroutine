import { ESLintUtils } from "@typescript-eslint/utils";
import * as path from "node:path";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "logger-name-match",
  meta: {
    type: "suggestion",
    docs: {
      description: "Enforce that getLogger() calls use the local filename as the logger name.",
    },
    messages: {
      mismatch: "Logger name must match the file path: '{{expected}}'. Found: '{{actual}}'.",
    },
    schema: [],
    fixable: "code",
  },
  defaultOptions: [],

  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "getLogger" &&
          node.arguments.length > 0
        ) {
          const arg = node.arguments[0];
          
          // Only handle string literals
          if (arg.type !== "Literal" || typeof arg.value !== "string") {
            return;
          }

          const actualName = arg.value;
          const filename = context.filename;
          
          // Determine the expected name based on the file path relative to the project root
          // We assume the project structure contains an 'api' directory or we are in it.
          
          // Normalize separators to forward slashes
          const normalizedFilename = filename.split(path.sep).join("/");
          
          // Try to find 'api/' index
          const apiIndex = normalizedFilename.indexOf("/api/");
          let expectedName = "";
          
          if (apiIndex !== -1) {
            // We found '/api/' in the path, grab everything from there
            expectedName = normalizedFilename.substring(apiIndex + 1);
          } else {
            // Fallback: relative to CWD
            const cwd = context.cwd.split(path.sep).join("/");
            if (normalizedFilename.startsWith(cwd)) {
                expectedName = normalizedFilename.substring(cwd.length + 1);
            } else {
                // Fallback to basename if we can't determine relative path
                expectedName = path.basename(normalizedFilename);
            }
          }

          // Enforce .ts/.tsx extension? The user example showed .ts
          // "So /api/agent/tools/manage-integration.ts should pass 'api/agent/tools/manage-integration.ts'"
          // Yes, keep extension.

          if (actualName !== expectedName) {
            context.report({
              node: arg,
              messageId: "mismatch",
              data: {
                expected: expectedName,
                actual: actualName,
              },
              fix(fixer) {
                return fixer.replaceText(arg, `"${expectedName}"`);
              },
            });
          }
        }
      },
    };
  },
});

export default rule;
