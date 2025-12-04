import type { SourceFile } from "ts-morph";
import type { ValidationError, ValidationContext } from "../types";

export const requireOutputsType = (
  sourceFile: SourceFile,
  _context?: ValidationContext
): ValidationError[] => {
  const outputsTypeAlias = sourceFile.getTypeAlias("Outputs");
  const outputsInterface = sourceFile.getInterface("Outputs");

  if (outputsTypeAlias || outputsInterface) {
    return [];
  }

  return [
    {
      rule: "require-outputs-type",
      message: "Code must define an Outputs type (type Outputs = {...} or interface Outputs {...})",
    },
  ];
};
