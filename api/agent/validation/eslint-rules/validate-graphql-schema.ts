import type { Rule } from "eslint";
import { buildSchema, parse, Source, validate } from "graphql";

const validateGraphqlOperation = (
  schemaSDL: string,
  operation: string
): { valid: true } | { valid: false; errors: Array<{ message: string }> } => {
  try {
    const schema = buildSchema(schemaSDL);
    const document = parse(new Source(operation, "Operation"));
    const errors = validate(schema, document);

    if (errors.length > 0) {
      return {
        valid: false,
        errors: errors.map((e) => ({ message: e.message })),
      };
    }
    return { valid: true };
  } catch (err) {
    if (err instanceof Error) {
      return {
        valid: false,
        errors: [{ message: err.message }],
      };
    }
    return {
      valid: false,
      errors: [{ message: String(err) }],
    };
  }
};

export const validateGraphqlQueries: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Validate GraphQL queries",
    },
    schema: [],
  },
  create(context) {
    const graphqlIntegrations =
      (context.settings?.agentValidation as any)?.graphqlIntegrations || [];

    if (!graphqlIntegrations || graphqlIntegrations.length === 0) {
      return {};
    }

    const schemaByName = new Map<string, string>();
    for (const integration of graphqlIntegrations) {
      schemaByName.set(integration.name, integration.schema);
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

        // check for integrations.getGraphQLClient("name")
        if (
          callExpr.callee.type === "MemberExpression" &&
          callExpr.callee.property.type === "Identifier" &&
          callExpr.callee.property.name === "getGraphQLClient"
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

        const schema = schemaByName.get(integrationName);
        if (!schema) return;

        if (node.arguments.length === 0) {
          context.report({
            node,
            message: `GraphQL request to "${integrationName}" is missing the query argument`,
          });
          return;
        }

        const queryArg = node.arguments[0];
        let queryString: string | null = null;

        if (queryArg.type === "Literal" && typeof queryArg.value === "string") {
          queryString = queryArg.value;
        } else if (queryArg.type === "TemplateLiteral" && queryArg.quasis.length === 1) {
          queryString = queryArg.quasis[0].value.cooked || queryArg.quasis[0].value.raw;
        } else if (queryArg.type === "TaggedTemplateExpression") {
          // Handle gql`...`
          if (queryArg.quasi.quasis.length === 1) {
            queryString =
              queryArg.quasi.quasis[0].value.cooked || queryArg.quasi.quasis[0].value.raw;
          }
        }

        if (queryString) {
          const result = validateGraphqlOperation(schema, queryString);
          if (!result.valid) {
            for (const validationError of result.errors) {
              context.report({
                node: queryArg,
                message: `Invalid GraphQL query for "${integrationName}": ${validationError.message}`,
              });
            }
          }
        }
      },
    };
  },
};
