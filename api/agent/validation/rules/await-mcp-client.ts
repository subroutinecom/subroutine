import { SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { ValidationError, ValidationContext } from "../types";

export const requireAwaitMcpClient = (
  sourceFile: SourceFile,
  _context?: ValidationContext
): ValidationError[] => {
  const errors: ValidationError[] = [];

  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expression = call.getExpression();

    if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expression.asKind(SyntaxKind.PropertyAccessExpression);
      if (propAccess?.getName() === "getMcpClient") {
        const parent = call.getParent();
        const isAwaited = parent?.getKind() === SyntaxKind.AwaitExpression;

        if (!isAwaited) {
          errors.push({
            rule: "require-await-mcp-client",
            message:
              "getMcpClient() returns a Promise and must be awaited: `const client = await integrations.getMcpClient(...)`",
            line: call.getStartLineNumber(),
            column: call.getStartLinePos(),
          });
        }
      }
    }
  }

  return errors;
};
