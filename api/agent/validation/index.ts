import { randomUUID } from "node:crypto";
import { Project } from "ts-morph";
import { rules } from "./rules";
import type { ValidationResult, ValidationError } from "./types";

const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: {
    strict: true,
    skipLibCheck: true,
  },
});

export const validateCode = (code: string): ValidationResult => {
  const filename = `${randomUUID()}.ts`;
  const sourceFile = project.createSourceFile(filename, code);

  try {
    const errors: ValidationError[] = [];

    for (const rule of rules) {
      errors.push(...rule(sourceFile));
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } finally {
    sourceFile.delete();
  }
};

export type { ValidationResult, ValidationError, ValidationRule } from "./types";
