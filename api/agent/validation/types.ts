import type { SourceFile } from "ts-morph";

export type ValidationError = {
  rule: string;
  message: string;
  line?: number;
  column?: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

export type ValidationRule = (sourceFile: SourceFile) => ValidationError[];
