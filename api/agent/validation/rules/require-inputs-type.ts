import type { SourceFile } from "ts-morph";
import type { ValidationError } from "../types";

export const requireInputsType = (sourceFile: SourceFile): ValidationError[] => {
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
