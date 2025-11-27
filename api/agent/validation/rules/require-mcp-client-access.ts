import { SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { ValidationError } from "../types";

export const requireMcpClientAccess = (sourceFile: SourceFile): ValidationError[] => {
  const errors: ValidationError[] = [];

  const propertyAccesses = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);

  for (const access of propertyAccesses) {
    const expression = access.getExpression();

    if (expression.getText() === "integrations") {
      const propertyName = access.getName();

      if (propertyName !== "getMcpClient") {
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
