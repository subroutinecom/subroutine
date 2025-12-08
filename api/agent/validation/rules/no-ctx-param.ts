import { SyntaxKind, type SourceFile } from "ts-morph";
import type { ValidationError, ValidationContext } from "../types";

export const noCtxUsage = (
  sourceFile: SourceFile,
  _context?: ValidationContext
): ValidationError[] => {
  const errors: ValidationError[] = [];

  const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier);

  for (const id of identifiers) {
    if (id.getText() !== "ctx") {
      continue;
    }

    const parent = id.getParent();
    if (!parent) continue;

    const parentKind = parent.getKind();

    if (parentKind === SyntaxKind.PropertyAccessExpression) {
      const propAccess = parent.asKind(SyntaxKind.PropertyAccessExpression);
      if (propAccess?.getExpression().getText() === "ctx") {
        errors.push({
          rule: "no-ctx-usage",
          message:
            "Code should not use ctx parameter. The main function signature is: main(inputs: Inputs, integrations: Integrations)",
          line: id.getStartLineNumber(),
        });
        return errors; // One error is enough
      }
    }

    if (parentKind === SyntaxKind.Parameter) {
      errors.push({
        rule: "no-ctx-usage",
        message:
          "Code should not use ctx parameter. The main function signature is: main(inputs: Inputs, integrations: Integrations)",
        line: id.getStartLineNumber(),
      });
      return errors;
    }

    if (parentKind === SyntaxKind.CallExpression) {
      const callExpr = parent.asKind(SyntaxKind.CallExpression);
      const args = callExpr?.getArguments() || [];
      if (args.some((arg) => arg.getText() === "ctx")) {
        errors.push({
          rule: "no-ctx-usage",
          message:
            "Code should not use ctx parameter. The main function signature is: main(inputs: Inputs, integrations: Integrations)",
          line: id.getStartLineNumber(),
        });
        return errors;
      }
    }
  }

  return errors;
};
