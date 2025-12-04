import { randomUUID } from "node:crypto";
import { Project } from "ts-morph";
import { rules } from "./rules/index.ts";
import { typeCheckCode } from "./type-checker.ts";
import { lintCode } from "./eslint-checker.ts";
import type { ValidationResult, ValidationError, ValidationContext } from "./types.ts";

const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: {
    strict: true,
    skipLibCheck: true,
  },
});

export const validateCode = async (
  code: string,
  context?: ValidationContext
): Promise<ValidationResult> => {
  const filename = `${randomUUID()}.ts`;
  const sourceFile = project.createSourceFile(filename, code);

  try {
    const errors: ValidationError[] = [];

    for (const rule of rules) {
      errors.push(...rule(sourceFile, context));
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    const typeCheckResult = typeCheckCode(code);
    if (!typeCheckResult.valid) {
      errors.push(...typeCheckResult.errors);
    }

    const lintResult = await lintCode(code);
    if (!lintResult.valid) {
      errors.push(...lintResult.errors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  } finally {
    sourceFile.delete();
  }
};
