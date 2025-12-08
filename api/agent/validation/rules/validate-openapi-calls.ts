import type { SourceFile, CallExpression, Node, VariableDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ValidationError, ValidationContext } from "../types";

/**
 * Validates OpenAPI request calls in generated code against their respective specs.
 *
 * This rule handles the pattern:
 *   const client = await integrations.getOpenAPIClient("my-api");
 *   const result = await client.request("GET", "/users", { limit: 10 });
 *
 * It:
 * 1. Finds getOpenAPIClient("name") calls and tracks variable → integration name
 * 2. Finds client.request(method, path, ...) calls and validates the method+path exists in the spec
 */
export const validateOpenAPICalls = (
  sourceFile: SourceFile,
  context?: ValidationContext
): ValidationError[] => {
  const errors: ValidationError[] = [];

  // If no OpenAPI integrations in context, nothing to validate
  if (!context?.openapiIntegrations?.length) {
    return errors;
  }

  // Build a map of operations by integration name for quick lookup
  const operationsByName = new Map<string, Set<string>>();
  for (const integration of context.openapiIntegrations) {
    const operationSet = new Set<string>();
    for (const op of integration.operations) {
      operationSet.add(`${op.method.toUpperCase()}:${op.path}`);
    }
    operationsByName.set(integration.name, operationSet);
  }

  // Track variable names that hold OpenAPI clients: variable name → integration name
  const clientVariableToIntegration = new Map<string, string>();

  // First pass: find all getOpenAPIClient("name") calls and track the variables
  sourceFile.forEachDescendant((node: Node) => {
    // Look for variable declarations like: const client = await integrations.getOpenAPIClient("name")
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

      // Check if this is a getOpenAPIClient call
      const exprText = callExpr.getExpression().getText();
      if (!exprText.endsWith("getOpenAPIClient")) return;

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

  // If no OpenAPI clients found, nothing to validate
  if (clientVariableToIntegration.size === 0) {
    return errors;
  }

  // Second pass: find all client.request(method, path, ...) calls and validate
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

    // Get the operations for this integration
    const operations = operationsByName.get(integrationName);
    if (!operations) return;

    // Get the method and path arguments
    const args = callExpr.getArguments();
    if (args.length < 2) {
      errors.push({
        rule: "validate-openapi-calls",
        message: `OpenAPI request to "${integrationName}" is missing required arguments (method, path)`,
        line: callExpr.getStartLineNumber(),
      });
      return;
    }

    const methodArg = args[0];
    const pathArg = args[1];

    const method = extractStringLiteral(methodArg);
    const path = extractStringLiteral(pathArg);

    if (method === null || path === null) {
      // Could not extract method or path (might be a variable)
      // We can't validate dynamic calls at compile time
      return;
    }

    // Validate the method + path exists in the spec
    const operationKey = `${method.toUpperCase()}:${path}`;
    if (!operations.has(operationKey)) {
      errors.push({
        rule: "validate-openapi-calls",
        message: `Invalid OpenAPI operation for "${integrationName}": ${method.toUpperCase()} ${path} is not defined in the spec`,
        line: callExpr.getStartLineNumber(),
      });
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
