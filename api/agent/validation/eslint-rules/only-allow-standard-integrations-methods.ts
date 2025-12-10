import type { Rule } from "eslint";

const VALID_INTEGRATION_METHODS = new Set(["getMcpClient", "getGraphQLClient", "getOpenAPIClient"]);

export const onlyAllowStandardIntegrationsMethods: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Restrict integrations object usage",
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object.type === "Identifier" && node.object.name === "integrations") {
          if (node.property.type === "Identifier") {
            const methodName = node.property.name;
            if (!VALID_INTEGRATION_METHODS.has(methodName)) {
              context.report({
                node,
                message: `Invalid integration access: 'integrations.${methodName}'. Use integrations.getMcpClient("${methodName}") to access MCP integrations.`,
              });
            }
          }
        }
      },
    };
  },
};
