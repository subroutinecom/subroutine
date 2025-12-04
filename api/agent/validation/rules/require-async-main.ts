import { SyntaxKind, type SourceFile } from "ts-morph";
import type { ValidationError, ValidationContext } from "../types";

export const requireAsyncMain = (
  sourceFile: SourceFile,
  _context?: ValidationContext
): ValidationError[] => {
  const mainFunc = sourceFile.getFunction("main");

  if (mainFunc) {
    if (mainFunc.isAsync()) {
      return [];
    }
    return [
      {
        rule: "require-async-main",
        message: "The main function must be async",
        line: mainFunc.getStartLineNumber(),
      },
    ];
  }

  const mainVar = sourceFile.getVariableDeclaration("main");
  if (mainVar) {
    const initializer = mainVar.getInitializer();
    if (initializer?.getKind() === SyntaxKind.ArrowFunction) {
      const arrowFunc = initializer.asKind(SyntaxKind.ArrowFunction);
      if (arrowFunc?.isAsync()) {
        return [];
      }
      return [
        {
          rule: "require-async-main",
          message: "The main function must be async",
          line: mainVar.getStartLineNumber(),
        },
      ];
    }
  }

  return [
    {
      rule: "require-async-main",
      message: "Code must define an async function named 'main'",
    },
  ];
};
