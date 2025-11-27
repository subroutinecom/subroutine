import type { SourceFile } from "ts-morph";
import type { ValidationError } from "../types";

export const requireExportMain = (sourceFile: SourceFile): ValidationError[] => {
  const mainFunc = sourceFile.getFunction("main");

  if (mainFunc?.isExported()) {
    return [];
  }

  const exportDecls = sourceFile.getExportDeclarations();
  for (const exp of exportDecls) {
    const namedExports = exp.getNamedExports();
    if (
      namedExports.some((n) => n.getName() === "main" || n.getAliasNode()?.getText() === "main")
    ) {
      return [];
    }
  }

  const mainVar = sourceFile.getVariableDeclaration("main");
  if (mainVar) {
    const varStatement = mainVar.getVariableStatement();
    if (varStatement?.isExported()) {
      return [];
    }
  }

  return [
    {
      rule: "require-export-main",
      message: "Code must export the main function",
      line: mainFunc?.getStartLineNumber(),
    },
  ];
};
