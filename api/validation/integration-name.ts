// Pattern: lowercase letters, numbers, hyphens, underscores only
export const INTEGRATION_NAME_PATTERN = /^[a-z0-9_-]+$/;

export interface IntegrationNameValidationResult {
  valid: boolean;
  error?: string;
}

export const validateIntegrationName = (name: string): IntegrationNameValidationResult => {
  if (!name || !name.trim()) {
    return { valid: false, error: "Integration name is required" };
  }

  if (!INTEGRATION_NAME_PATTERN.test(name)) {
    return {
      valid: false,
      error: "Integration name can only contain lowercase letters (a-z), numbers (0-9), hyphens (-), and underscores (_)",
    };
  }

  return { valid: true };
};
