import type { SourceFile } from "ts-morph";
import type { ValidationError, ValidationContext } from "../types";

export const requireInputsType = (
  sourceFile: SourceFile,
  _context?: ValidationContext
): ValidationError[] => {
  const inputsTypeAlias = sourceFile.getTypeAlias("Inputs");
  const inputsInterface = sourceFile.getInterface("Inputs");

  if (inputsTypeAlias || inputsInterface) {
    return [];
  }

  return [
    {
      rule: "require-inputs-type",
      message: "Code must define an Inputs type (type Inputs = {...} or interface Inputs {...})",
    },
  ];
};
