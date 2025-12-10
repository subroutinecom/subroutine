import type { Rule } from "eslint";

export const noNetworkFetch: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow fetch calls",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        // fetch(...)
        if (node.callee.type === "Identifier" && node.callee.name === "fetch") {
          context.report({
            node,
            message:
              "Cannot use fetch() in subroutines. Code runs in a sandboxed environment without network access. All external communication must be done via integrations.",
          });
          return;
        }

        // globalThis.fetch / window.fetch
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "fetch"
        ) {
          if (
            node.callee.object.type === "Identifier" &&
            (node.callee.object.name === "globalThis" || node.callee.object.name === "window")
          ) {
            context.report({
              node,
              message:
                "Cannot use fetch() in subroutines. Code runs in a sandboxed environment without network access. All external communication must be done via integrations.",
            });
          }
        }
      },
    };
  },
};
