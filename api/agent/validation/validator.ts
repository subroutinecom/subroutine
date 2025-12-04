import { checkCustomRules } from "./ast-checker.ts";
import { typeCheckCode } from "./type-checker.ts";
import type { ValidationContext, ValidationError, ValidationResult } from "./types.ts";

export const validateCode = async (
  code: string,
  context?: ValidationContext
): Promise<ValidationResult> => {
  const errors: ValidationError[] = [];

  const customRulesResult = checkCustomRules(code, context);
  if (!customRulesResult.valid) {
    errors.push(...customRulesResult.errors);
    return { valid: false, errors };
  }

  const typeCheckResult = typeCheckCode(code);
  if (!typeCheckResult.valid) {
    errors.push(...typeCheckResult.errors);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
