import { validateWithEslint } from "./eslint.ts";
// import { checkCustomRules } from "./ast-checker.ts";
import { typeCheckCode } from "./type-checker.ts";
import type { ValidationContext, ValidationError, ValidationResult } from "./types.ts";

export const validateCode = async (
  code: string,
  context?: ValidationContext
): Promise<ValidationResult> => {
  const errors: ValidationError[] = [];

  /*
  const customRulesResult = checkCustomRules(code, context);
  if (!customRulesResult.valid) {
    errors.push(...customRulesResult.errors);
    return { valid: false, errors };
  }
  */

  const [eslintResult, typeCheckResult] = await Promise.all([
    Promise.resolve(validateWithEslint(code, context)),
    Promise.resolve(typeCheckCode(code)),
  ]);

  if (!eslintResult.valid) {
    errors.push(...eslintResult.errors);
  }

  if (!typeCheckResult.valid) {
    errors.push(...typeCheckResult.errors);
  }

  // Let's rewrite strictly to push all.

  return {
    valid: errors.length === 0,
    errors,
  };
};
