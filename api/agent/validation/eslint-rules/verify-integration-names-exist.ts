import type { Rule } from "eslint";

export const verifyIntegrationNamesExist: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Validate integration names",
    },
    schema: [],
  },
  create(context) {
    const validNames = (context.settings?.agentValidation as any)?.mcpIntegrationNames || [];

    if (!validNames || validNames.length === 0) {
      return {};
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "getMcpClient"
        ) {
          if (node.arguments.length === 0) {
            context.report({
              node,
              message: `getMcpClient() requires an integration name argument. Available integrations: ${validNames.map((n: string) => `"${n}"`).join(", ")}`,
            });
            return;
          }

          const firstArg = node.arguments[0];

          let integrationName: string | null = null;

          if (firstArg.type === "Literal" && typeof firstArg.value === "string") {
            integrationName = firstArg.value;
          } else if (firstArg.type === "TemplateLiteral" && firstArg.quasis.length === 1) {
            integrationName = firstArg.quasis[0].value.cooked || firstArg.quasis[0].value.raw;
          }

          if (integrationName && !validNames.includes(integrationName)) {
            context.report({
              node: firstArg,
              message: `Unknown integration name "${integrationName}". Available integrations: ${validNames.map((n: string) => `"${n}"`).join(", ")}`,
            });
          }
        }
      },
    };
  },
};
