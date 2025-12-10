import type { Rule } from "eslint";

export const awaitMcpClient: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure getMcpClient() is awaited",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "getMcpClient"
        ) {
          if (node.parent.type !== "AwaitExpression") {
            context.report({
              node,
              message:
                "getMcpClient() returns a Promise and must be awaited: `const client = await integrations.getMcpClient(...)`",
            });
          }
        }
      },
    };
  },
};
