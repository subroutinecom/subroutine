import type { Config } from "./schema.ts";

/**
 * Validates configuration consistency beyond schema validation.
 * Checks that capability mappings reference valid model definitions.
 */
export function validateConfig(config: Config): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate that all capabilities map to defined models
  for (const [capability, modelNames] of Object.entries(config.capabilities)) {
    const names = Array.isArray(modelNames) ? modelNames : [modelNames];

    for (const modelName of names) {
      if (!config.models[modelName]) {
        errors.push(`Capability "${capability}" references undefined model "${modelName}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Prints a detailed report of the configuration.
 * Useful for debugging and verification.
 */
export function printConfigReport(config: Config): void {
  console.log("[Config Validator]", "\n📋 Configuration Report");
  console.log("[Config Validator]", "=".repeat(50));

  console.log("[Config Validator]", "\n🤖 Models Defined:");
  for (const [modelName, modelConfig] of Object.entries(config.models)) {
    console.log(`  • ${modelName}`);
    console.log(`    Provider: ${modelConfig.provider}`);
    console.log(`    Model: ${modelConfig.model}`);
    if (modelConfig.apiKey) {
      console.log(`    API Key: ${modelConfig.apiKey.substring(0, 10)}...`);
    }
    if (modelConfig.endpoint) {
      console.log(`    Endpoint: ${modelConfig.endpoint}`);
    }
  }

  console.log("[Config Validator]", "\n🎯 Capability Mappings:");
  for (const [capability, modelNames] of Object.entries(config.capabilities)) {
    const names = Array.isArray(modelNames) ? modelNames : [modelNames];
    console.log(`  • ${capability} → ${names.join(", ")}`);
  }

  const validation = validateConfig(config);
  if (validation.valid) {
    console.log("[Config Validator]", "\n✅ Configuration is valid");
  } else {
    console.log("[Config Validator]", "\n❌ Configuration has errors:");
    for (const error of validation.errors) {
      console.log(`  • ${error}`);
    }
  }

  console.log("[Config Validator]", "=".repeat(50) + "\n");
}
