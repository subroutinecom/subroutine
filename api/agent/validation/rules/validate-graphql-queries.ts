import type { SourceFile, CallExpression, Node, VariableDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ValidationError, ValidationContext } from "../types";
import { buildSchema, parse, validate, Source } from "graphql";

/**
 * Validates a GraphQL operation against a schema SDL.
 * Returns { valid: true } or { valid: false, errors: [...] }
 */
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

/**
 * Validates GraphQL queries in generated code against their respective schemas.
 *
 * This rule handles the pattern:
 *   const client = await integrations.getGraphQLClient("my-api");
 *   const result = await client.request(`query { ... }`);
 *
 * It:
 * 1. Finds getGraphQLClient("name") calls and tracks variable → integration name
 * 2. Finds client.request(query) calls and validates the query against the schema
 */
export const validateGraphqlQueries = (
  sourceFile: SourceFile,
  context?: ValidationContext
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // If no GraphQL integrations in context, nothing to validate
  if (!context?.graphqlIntegrations?.length) {
    return errors;
  }

  // Build a map of schema by integration name for quick lookup
  const schemaByName = new Map<string, string>();
  for (const integration of context.graphqlIntegrations) {
    schemaByName.set(integration.name, integration.schema);
  }

  // Track variable names that hold GraphQL clients: variable name → integration name
  const clientVariableToIntegration = new Map<string, string>();

  // First pass: find all getGraphQLClient("name") calls and track the variables
  sourceFile.forEachDescendant((node: Node) => {
    // Look for variable declarations like: const client = await integrations.getGraphQLClient("name")
    if (node.getKind() === SyntaxKind.VariableDeclaration) {
      const varDecl = node as VariableDeclaration;
      const initializer = varDecl.getInitializer();
      if (!initializer) return;

      // Handle await expressions
      let callExpr: CallExpression | undefined;
      if (initializer.getKind() === SyntaxKind.AwaitExpression) {
        const awaitExpr = initializer.getFirstChildByKind(SyntaxKind.CallExpression);
        if (awaitExpr) callExpr = awaitExpr as CallExpression;
      } else if (initializer.getKind() === SyntaxKind.CallExpression) {
        callExpr = initializer as CallExpression;
      }

      if (!callExpr) return;

      // Check if this is a getGraphQLClient call
      const exprText = callExpr.getExpression().getText();
      if (!exprText.endsWith("getGraphQLClient")) return;

      // Get the integration name from the first argument
      const args = callExpr.getArguments();
      if (args.length === 0) return;

      const nameArg = args[0];
      const integrationName = extractStringLiteral(nameArg);
      if (!integrationName) return;

      // Track this variable
      const varName = varDecl.getName();
      clientVariableToIntegration.set(varName, integrationName);
    }
  });

  // If no GraphQL clients found, nothing to validate
  if (clientVariableToIntegration.size === 0) {
    return errors;
  }

  // Second pass: find all client.request(query) calls and validate
  sourceFile.forEachDescendant((node: Node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) return;

    const callExpr = node as CallExpression;
    const expression = callExpr.getExpression();

    // Check for pattern: someVar.request(...)
    if (expression.getKind() !== SyntaxKind.PropertyAccessExpression) return;

    const propAccess = expression;
    const propName = propAccess.getLastChild()?.getText();
    if (propName !== "request") return;

    // Get the object being called on (e.g., "client" in "client.request")
    const objectExpr = propAccess.getFirstChild();
    if (!objectExpr) return;

    const objectName = objectExpr.getText();
    const integrationName = clientVariableToIntegration.get(objectName);
    if (!integrationName) return;

    // Get the schema for this integration
    const schema = schemaByName.get(integrationName);
    if (!schema) return;

    // Get the first argument (the query)
    const args = callExpr.getArguments();
    if (args.length === 0) {
      errors.push({
        rule: "validate-graphql-queries",
        message: `GraphQL request to "${integrationName}" is missing the query argument`,
        line: callExpr.getStartLineNumber(),
      });
      return;
    }

    const queryArg = args[0];
    const queryString = extractQueryString(queryArg);

    if (queryString === null) {
      // Could not extract query string (might be a variable)
      // We can't validate dynamic queries at compile time
      return;
    }

    // Validate the query against the schema
    const result = validateGraphqlOperation(schema, queryString);
    if (!result.valid) {
      for (const validationError of result.errors) {
        errors.push({
          rule: "validate-graphql-queries",
          message: `Invalid GraphQL query for "${integrationName}": ${validationError.message}`,
          line: queryArg.getStartLineNumber(),
        });
      }
    }
  });

  return errors;
};

/**
 * Extracts a string literal value from a node.
 * Returns null if the node is not a string literal.
 */
const extractStringLiteral = (node: Node): string | null => {
  if (node.getKind() === SyntaxKind.StringLiteral) {
    const text = node.getText();
    // Remove quotes
    return text.slice(1, -1);
  }
  return null;
};

/**
 * Extracts the query string from a GraphQL call argument.
 * Handles:
 * - Template literals: client.request(`query { ... }`)
 * - String literals: client.request("query { ... }")
 *
 * Returns null if the query cannot be statically extracted.
 */
const extractQueryString = (node: Node): string | null => {
  const kind = node.getKind();

  // Handle template literal: `query { ... }`
  if (kind === SyntaxKind.TemplateExpression || kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
    // For NoSubstitutionTemplateLiteral, get the text directly
    if (kind === SyntaxKind.NoSubstitutionTemplateLiteral) {
      const text = node.getText();
      // Remove the backticks
      return text.slice(1, -1);
    }

    // For TemplateExpression with substitutions, we can't fully validate
    // as they're dynamic
    return null;
  }

  // Handle string literal: "query { ... }" or 'query { ... }'
  if (kind === SyntaxKind.StringLiteral) {
    const text = node.getText();
    // Remove quotes (handles both " and ')
    return text.slice(1, -1);
  }

  // Handle tagged template: gql`query { ... }`
  if (kind === SyntaxKind.TaggedTemplateExpression) {
    // Get the template part
    const children = node.getChildren();
    for (const child of children) {
      const childKind = child.getKind();
      if (
        childKind === SyntaxKind.NoSubstitutionTemplateLiteral ||
        childKind === SyntaxKind.TemplateExpression
      ) {
        return extractQueryString(child);
      }
    }
  }

  // Cannot extract query from this node type
  return null;
};
