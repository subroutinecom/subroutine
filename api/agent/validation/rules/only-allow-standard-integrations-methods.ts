import { SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { ValidationError, ValidationContext } from "../types";

/** Valid methods that can be called on the integrations object */
const VALID_INTEGRATION_METHODS = new Set([
  "getMcpClient",
  "getGraphQLClient",
  "getOpenAPIClient",
]);

export const requireMcpClientAccess = (
  sourceFile: SourceFile,
  _context?: ValidationContext
): ValidationError[] => {
  const errors: ValidationError[] = [];

  const propertyAccesses = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);

  for (const access of propertyAccesses) {
    const expression = access.getExpression();

    if (expression.getText() === "integrations") {
      const propertyName = access.getName();

      if (!VALID_INTEGRATION_METHODS.has(propertyName)) {
        errors.push({
          rule: "require-mcp-client-access",
          message: `Invalid integration access: 'integrations.${propertyName}'. Use integrations.getMcpClient("${propertyName}") to access MCP integrations.`,
          line: access.getStartLineNumber(),
          column: access.getStartLinePos(),
        });
      }
    }
  }

  return errors;
};
