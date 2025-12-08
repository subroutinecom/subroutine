import { SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { ValidationError, ValidationContext } from "../types";

/**
 * Validates that the string argument passed to getMcpClient() is a known integration name.
 * This catches cases where the model "makes up" integration names that don't exist.
 */
export const validateMcpIntegrationName = (
  sourceFile: SourceFile,
  context?: ValidationContext
): ValidationError[] => {
  const errors: ValidationError[] = [];
  const validNames = context?.mcpIntegrationNames ?? [];

  // If no integrations are provided, skip validation
  if (validNames.length === 0) {
    return errors;
  }

  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expression = call.getExpression();

    if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expression.asKind(SyntaxKind.PropertyAccessExpression);
      if (propAccess?.getName() === "getMcpClient") {
        const args = call.getArguments();

        if (args.length === 0) {
          errors.push({
            rule: "validate-mcp-integration-name",
            message: `getMcpClient() requires an integration name argument. Available integrations: ${validNames.map((n) => `"${n}"`).join(", ")}`,
            line: call.getStartLineNumber(),
            column: call.getStartLinePos(),
          });
          continue;
        }

        const firstArg = args[0];
        // Check if it's a string literal
        if (firstArg.getKind() === SyntaxKind.StringLiteral) {
          const stringLiteral = firstArg.asKind(SyntaxKind.StringLiteral);
          const integrationName = stringLiteral?.getLiteralText();

          if (integrationName && !validNames.includes(integrationName)) {
            errors.push({
              rule: "validate-mcp-integration-name",
              message: `Unknown integration name "${integrationName}". Available integrations: ${validNames.map((n) => `"${n}"`).join(", ")}`,
              line: call.getStartLineNumber(),
              column: call.getStartLinePos(),
            });
          }
        } else if (firstArg.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
          // Handle template literals without substitutions: `my-integration`
          const templateLiteral = firstArg.asKind(SyntaxKind.NoSubstitutionTemplateLiteral);
          const integrationName = templateLiteral?.getLiteralText();

          if (integrationName && !validNames.includes(integrationName)) {
            errors.push({
              rule: "validate-mcp-integration-name",
              message: `Unknown integration name "${integrationName}". Available integrations: ${validNames.map((n) => `"${n}"`).join(", ")}`,
              line: call.getStartLineNumber(),
              column: call.getStartLinePos(),
            });
          }
        }
        // For dynamic expressions (variables, template literals with substitutions),
        // we skip validation since we can't determine the value at compile time.
        // Runtime will still catch invalid names.
      }
    }
  }

  return errors;
};
