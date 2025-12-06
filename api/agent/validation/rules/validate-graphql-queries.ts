import type { SourceFile, CallExpression, Node } from "ts-morph";
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
 * This rule:
 * 1. Finds imports from "subroutine:integration/NAME" that import `graphql`
 * 2. Tracks the mapping of imported function name → integration name
 * 3. Finds all calls to those imported graphql functions
 * 4. Extracts the query string from the first argument
 * 5. Validates each query against the correct schema from context
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

  // Find all imports from subroutine:integration/* and track graphql function aliases
  // Maps: local function name → integration name
  const graphqlFunctionToIntegration = new Map<string, string>();

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();

    // Check if this is a subroutine integration import
    const match = moduleSpecifier.match(/^subroutine:integration\/(.+)$/);
    if (!match) continue;

    const integrationName = match[1];

    // Check if this integration has a schema we can validate against
    if (!schemaByName.has(integrationName)) continue;

    // Find the `graphql` named import (might be aliased)
    for (const namedImport of importDecl.getNamedImports()) {
      const importedName = namedImport.getName();
      if (importedName === "graphql") {
        // Get the local name (alias or original)
        const localName = namedImport.getAliasNode()?.getText() ?? importedName;
        graphqlFunctionToIntegration.set(localName, integrationName);
      }
    }
  }

  // If no graphql imports found, nothing to validate
  if (graphqlFunctionToIntegration.size === 0) {
    return errors;
  }

  // Find all call expressions in the file
  sourceFile.forEachDescendant((node: Node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) return;

    const callExpr = node as CallExpression;
    const expression = callExpr.getExpression();

    // Check if this is a call to one of our tracked graphql functions
    const calledName = expression.getText();
    const integrationName = graphqlFunctionToIntegration.get(calledName);
    if (!integrationName) return;

    // Get the schema for this integration
    const schema = schemaByName.get(integrationName);
    if (!schema) return;

    // Get the first argument (the query)
    const args = callExpr.getArguments();
    if (args.length === 0) {
      errors.push({
        rule: "validate-graphql-queries",
        message: `GraphQL call to "${integrationName}" is missing the query argument`,
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
 * Extracts the query string from a GraphQL call argument.
 * Handles:
 * - Template literals: graphql(`query { ... }`)
 * - String literals: graphql("query { ... }")
 * - Tagged template literals with variables (extracts static parts)
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
    // but we could try to validate the structure
    // For now, skip these as they're dynamic
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
