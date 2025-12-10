import type { Rule } from "eslint";

export const validateOpenAPICalls: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Validate OpenAPI calls",
    },
    schema: [],
  },
  create(context) {
    const openapiIntegrations =
      (context.settings?.agentValidation as any)?.openapiIntegrations || [];

    if (!openapiIntegrations || openapiIntegrations.length === 0) {
      return {};
    }

    const operationsByName = new Map<string, Set<string>>();
    for (const integration of openapiIntegrations) {
      const operationSet = new Set<string>();
      for (const op of integration.operations) {
        operationSet.add(`${op.method.toUpperCase()}:${op.path}`);
      }
      operationsByName.set(integration.name, operationSet);
    }

    const clientVariableToIntegration = new Map<string, string>();

    return {
      VariableDeclarator(node) {
        if (!node.init) return;

        let callExpr: any = node.init;
        if (callExpr.type === "AwaitExpression") {
          callExpr = callExpr.argument;
        }

        if (callExpr.type !== "CallExpression") return;

        // check for integrations.getOpenAPIClient("name")
        if (
          callExpr.callee.type === "MemberExpression" &&
          callExpr.callee.property.type === "Identifier" &&
          callExpr.callee.property.name === "getOpenAPIClient"
        ) {
          const args = callExpr.arguments;
          if (args.length > 0) {
            const firstArg = args[0];
            let integrationName: string | null = null;
            if (firstArg.type === "Literal" && typeof firstArg.value === "string") {
              integrationName = firstArg.value;
            }

            if (integrationName && node.id.type === "Identifier") {
              clientVariableToIntegration.set(node.id.name, integrationName);
            }
          }
        }
      },
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression") return;
        if (node.callee.property.type !== "Identifier" || node.callee.property.name !== "request")
          return;

        if (node.callee.object.type !== "Identifier") return;
        const objectName = node.callee.object.name;

        const integrationName = clientVariableToIntegration.get(objectName);
        if (!integrationName) return;

        const operations = operationsByName.get(integrationName);
        if (!operations) return;

        if (node.arguments.length < 2) {
          context.report({
            node,
            message: `OpenAPI request to "${integrationName}" is missing required arguments (method, path)`,
          });
          return;
        }

        const methodArg = node.arguments[0];
        const pathArg = node.arguments[1];

        let method: string | null = null;
        let path: string | null = null;

        if (methodArg.type === "Literal" && typeof methodArg.value === "string") {
          method = methodArg.value;
        }

        if (pathArg.type === "Literal" && typeof pathArg.value === "string") {
          path = pathArg.value;
        }

        if (method && path) {
          const operationKey = `${method.toUpperCase()}:${path}`;
          if (!operations.has(operationKey)) {
            context.report({
              node: node,
              message: `Invalid OpenAPI operation for "${integrationName}": ${method.toUpperCase()} ${path} is not defined in the spec`,
            });
          }
        }
      },
    };
  },
};
