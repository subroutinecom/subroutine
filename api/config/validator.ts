import { getLogger } from "../utils/logger.ts";
import type { Config } from "./schema.ts";
const logger = getLogger("api/config/validator.ts");

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
  logger.info(`\n📋 Configuration Report\n${"=".repeat(50)}`);

  logger.info("\n🤖 Models Defined:");
  for (const [modelName, modelConfig] of Object.entries(config.models)) {
    logger.info(`  • ${modelName}`);
    logger.info(`    Provider: ${modelConfig.provider}`);
    logger.info(`    Model: ${modelConfig.model}`);
    if (modelConfig.apiKey) {
      logger.info(`    API Key: ${modelConfig.apiKey.substring(0, 10)}...`);
    }
    if (modelConfig.endpoint) {
      logger.info(`    Endpoint: ${modelConfig.endpoint}`);
    }
  }

  logger.info("\n🎯 Capability Mappings:");
  for (const [capability, modelNames] of Object.entries(config.capabilities)) {
    const names = Array.isArray(modelNames) ? modelNames : [modelNames];
    logger.info(`  • ${capability} → ${names.join(", ")}`);
  }

  const validation = validateConfig(config);
  if (validation.valid) {
    logger.info("\n✅ Configuration is valid");
  } else {
    logger.info("\n❌ Configuration has errors:");
    for (const error of validation.errors) {
      logger.info(`  • ${error}`);
    }
  }

  logger.info(`\n${"=".repeat(50)}\n`);
}
