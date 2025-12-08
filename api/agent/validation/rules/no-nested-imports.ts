import { SyntaxKind, type SourceFile } from "ts-morph";
import type { ValidationRule } from "../types";

export const noNestedImports: ValidationRule = (sourceFile: SourceFile) => {
  const imports = sourceFile.getDescendantsOfKind(SyntaxKind.ImportDeclaration);
  
  for (const importDecl of imports) {
    const parent = importDecl.getParent();
    if (parent?.getKind() !== SyntaxKind.SourceFile) {
      return [{
        rule: "no-nested-imports",
        message: "Import statements must be at the top level of the file, not inside functions or blocks.",
        line: importDecl.getStartLineNumber()
      }];
    }
  }

  return [];
};
