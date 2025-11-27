import { SyntaxKind, type SourceFile } from "ts-morph";
import type { ValidationError } from "../types";

export const noFetchCalls = (sourceFile: SourceFile): ValidationError[] => {
  const errors: ValidationError[] = [];

  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const callExpr of callExpressions) {
    const expression = callExpr.getExpression();

    if (expression.getKind() === SyntaxKind.Identifier && expression.getText() === "fetch") {
      errors.push({
        rule: "no-fetch-calls",
        message:
          "Cannot use fetch() in subroutines. Code runs in a sandboxed environment without network access. All external communication must be done via integrations.",
        line: callExpr.getStartLineNumber(),
      });
      return errors; // One error is enough
    }

    if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expression.asKind(SyntaxKind.PropertyAccessExpression);
      const propName = propAccess?.getName();
      const objText = propAccess?.getExpression().getText();

      if (propName === "fetch" && (objText === "globalThis" || objText === "window")) {
        errors.push({
          rule: "no-fetch-calls",
          message:
            "Cannot use fetch() in subroutines. Code runs in a sandboxed environment without network access. All external communication must be done via integrations.",
          line: callExpr.getStartLineNumber(),
        });
        return errors;
      }
    }
  }

  return errors;
};
