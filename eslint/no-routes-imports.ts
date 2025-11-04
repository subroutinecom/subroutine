import { ESLintUtils } from "@typescript-eslint/utils";
import path from "path";

const createRule = ESLintUtils.RuleCreator((name) => `http://docs.subroutine.com/rule/${name}`);

const rule = createRule({
  name: "no-ropute-imports",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow importing from the routes dir, move common code to server or components dir",
    },
    messages: {
      noRouteImport: "Importing from the routes directory is not allowed.",
    },
    schema: [], // no options
  },
  defaultOptions: [],

  create(context) {
    return {
      ImportDeclaration(node) {
        if (typeof node.source.value === "string" && node.source.value.startsWith("@/routes/")) {
          context.report({
            node,
            messageId: "noRouteImport",
          });
        }

        // also, resolve the path to see if it's a relative import into routes
        if (node.source.value.startsWith(".")) {
          const importingFilePath = context.filename;
          if (importingFilePath.includes("/routes/")) {
            const resolvedPath = path.resolve(path.dirname(importingFilePath), node.source.value);
            if (resolvedPath.includes("/routes/")) {
              context.report({
                node,
                messageId: "noRouteImport",
              });
            }
          }
        }
      },
    };
  },
});

export default rule;
