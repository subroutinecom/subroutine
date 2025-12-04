import { SyntaxKind, type SourceFile, type Node } from "ts-morph";
import type { ValidationError, ValidationContext } from "../types";

const hasReturnStatement = (node: Node): boolean => {
  // Check if this node is a return statement
  if (node.getKind() === SyntaxKind.ReturnStatement) {
    return true;
  }

  // Recursively check children, but skip nested function scopes
  for (const child of node.getChildren()) {
    const kind = child.getKind();

    // Skip nested function scopes - returns in nested functions don't count
    if (
      kind === SyntaxKind.FunctionDeclaration ||
      kind === SyntaxKind.FunctionExpression ||
      kind === SyntaxKind.ArrowFunction
    ) {
      continue;
    }

    if (hasReturnStatement(child)) {
      return true;
    }
  }

  return false;
};

export const requireReturnInMain = (
  sourceFile: SourceFile,
  _context?: ValidationContext
): ValidationError[] => {
  const mainFunc = sourceFile.getFunction("main");

  if (mainFunc) {
    const body = mainFunc.getBody();
    if (body && hasReturnStatement(body)) {
      return [];
    }
    return [
      {
        rule: "require-return-in-main",
        message: "The main function must have a return statement",
        line: mainFunc.getStartLineNumber(),
      },
    ];
  }

  // Check for arrow function: const main = async () => {}
  const mainVar = sourceFile.getVariableDeclaration("main");
  if (mainVar) {
    const initializer = mainVar.getInitializer();
    if (initializer?.getKind() === SyntaxKind.ArrowFunction) {
      const arrowFunc = initializer.asKind(SyntaxKind.ArrowFunction);
      if (arrowFunc) {
        const body = arrowFunc.getBody();

        // Arrow function with expression body implicitly returns
        if (body.getKind() !== SyntaxKind.Block) {
          return [];
        }

        // Block body needs explicit return
        if (hasReturnStatement(body)) {
          return [];
        }

        return [
          {
            rule: "require-return-in-main",
            message: "The main function must have a return statement",
            line: mainVar.getStartLineNumber(),
          },
        ];
      }
    }
  }

  // If there's no main function at all, other rules will catch it
  return [];
};
