import { z } from "zod";
import { parseOpenAPISpec } from "../../integrations/openapi-introspection.ts";
import {
  getAvailableIntegrations,
  getIntegrationOrGlobal,
  type GraphQLIntegrationConfig,
  type OpenAPIIntegrationConfig,
} from "../../models/integration.ts";
import { getLogger } from "../../utils/logger.ts";
import type { IntegrationInfo } from "../prompts/index.ts";
import type { McpContext, SubroutineCapture } from "../utils/types.ts";
import type {
  GraphQLIntegrationSchema,
  OpenAPIIntegrationSchema,
  ValidationContext,
} from "../validation/types.ts";
import { validateCode } from "../validation/validator.ts";
const logger = getLogger("api/agent/tools/write-code.ts", "debug");

type GenerateSubroutineOptions = {
  shouldGenerateInputs?: boolean;
  mcpContext?: McpContext;
  /** Specific integrations to use (MCP or GraphQL) - for provided mode, not discovery mode */
  integrations?: IntegrationInfo[];
};

const buildValidationContext = async (
  options?: GenerateSubroutineOptions
): Promise<ValidationContext | undefined> => {
  if (options?.integrations?.length && options.mcpContext) {
    // Provided mode: fetch schemas for GraphQL and OpenAPI integrations
    const mcpNames = options.integrations.filter((i) => i.type === "mcp").map((i) => i.name);

    // For GraphQL integrations, fetch the full integration to get the schema
    const graphqlIntegrations: GraphQLIntegrationSchema[] = [];
    for (const integration of options.integrations.filter((i) => i.type === "graphql")) {
      const fullIntegration = await getIntegrationOrGlobal(
        integration.id,
        options.mcpContext.organizationId
      );
      if (fullIntegration?.authConfig.type === "graphql") {
        const config = fullIntegration.authConfig as GraphQLIntegrationConfig;
        if (config.schema) {
          graphqlIntegrations.push({
            name: integration.name,
            schema: config.schema,
          });
          logger.debug(`Found schema for GraphQL integration "${integration.name}"`);
        } else {
          logger.debug(`No schema cached for GraphQL integration "${integration.name}"`);
        }
      }
    }

    // For OpenAPI integrations, fetch the full integration to get the spec
    const openapiIntegrations: OpenAPIIntegrationSchema[] = [];
    for (const integration of options.integrations.filter((i) => i.type === "openapi")) {
      const fullIntegration = await getIntegrationOrGlobal(
        integration.id,
        options.mcpContext.organizationId
      );
      if (fullIntegration?.authConfig.type === "openapi") {
        const config = fullIntegration.authConfig as OpenAPIIntegrationConfig;
        if (config.spec) {
          const parseResult = await parseOpenAPISpec(config.spec);
          if (parseResult.ok) {
            openapiIntegrations.push({
              name: integration.name,
              spec: config.spec,
              operations: parseResult.result.operations.map((op) => ({
                method: op.method,
                path: op.path,
              })),
            });
            logger.debug(`Found spec for OpenAPI integration "${integration.name}"`);
          }
        } else {
          logger.debug(`No spec cached for OpenAPI integration "${integration.name}"`);
        }
      }
    }

    return {
      mcpIntegrationNames: mcpNames.length > 0 ? mcpNames : undefined,
      graphqlIntegrations: graphqlIntegrations.length > 0 ? graphqlIntegrations : undefined,
      openapiIntegrations: openapiIntegrations.length > 0 ? openapiIntegrations : undefined,
    };
  }

  if (options?.mcpContext) {
    // Discovery mode: fetch all available integrations
    const integrations = await getAvailableIntegrations(options.mcpContext.organizationId, "all");
    const enabledIntegrations = integrations.filter(
      (i) =>
        i.enabled &&
        (i.authConfig.type === "mcp" ||
          i.authConfig.type === "graphql" ||
          i.authConfig.type === "openapi")
    );

    if (enabledIntegrations.length > 0) {
      const mcpNames = enabledIntegrations
        .filter((i) => i.authConfig.type === "mcp")
        .map((i) => i.name);

      // Extract GraphQL integrations with their schemas
      const graphqlIntegrations: GraphQLIntegrationSchema[] = [];
      for (const integration of enabledIntegrations.filter(
        (i) => i.authConfig.type === "graphql"
      )) {
        const config = integration.authConfig as GraphQLIntegrationConfig;
        if (config.schema) {
          graphqlIntegrations.push({
            name: integration.name,
            schema: config.schema,
          });
        }
      }

      // Extract OpenAPI integrations with their specs
      const openapiIntegrations: OpenAPIIntegrationSchema[] = [];
      for (const integration of enabledIntegrations.filter(
        (i) => i.authConfig.type === "openapi"
      )) {
        const config = integration.authConfig as OpenAPIIntegrationConfig;
        if (config.spec) {
          const parseResult = await parseOpenAPISpec(config.spec);
          if (parseResult.ok) {
            openapiIntegrations.push({
              name: integration.name,
              spec: config.spec,
              operations: parseResult.result.operations.map((op) => ({
                method: op.method,
                path: op.path,
              })),
            });
          }
        }
      }

      return {
        mcpIntegrationNames: mcpNames.length > 0 ? mcpNames : undefined,
        graphqlIntegrations: graphqlIntegrations.length > 0 ? graphqlIntegrations : undefined,
        openapiIntegrations: openapiIntegrations.length > 0 ? openapiIntegrations : undefined,
      };
    }
  }

  return undefined;
};

export const createWriteCodeTool = (
  onCapture: (result: SubroutineCapture) => void,
  options?: GenerateSubroutineOptions
) => {
  const baseToolSchema = z.object({
    inputsSchema: z.record(z.unknown()).describe("JSON Schema for the input parameters"),
    outputsSchema: z.record(z.unknown()).describe("JSON Schema for the output"),
    code: z
      .string()
      .describe("The TypeScript code that exports an async main function with proper types"),
  });

  const toolSchema = options?.shouldGenerateInputs
    ? baseToolSchema.extend({
        generatedInputs: z
          .record(z.unknown())
          .optional()
          .describe("Concrete values conforming to inputsSchema for immediate execution"),
      })
    : baseToolSchema;

  return {
    description: "Submit a generated TypeScript function with input and output schemas",
    inputSchema: toolSchema,
    execute: async (params: z.infer<typeof toolSchema>) => {
      logger.debug(`Called`);
      logger.debug(`Code length: ${params.code.length} chars`);
      const { inputsSchema, outputsSchema, code } = params;
      const generatedInputs =
        "generatedInputs" in params
          ? (params.generatedInputs as Record<string, unknown>)
          : undefined;

      const validationContext = await buildValidationContext(options);
      logger.info(`Validating code with context: ${JSON.stringify(validationContext)}`);
      const validation = await validateCode(code, validationContext);

      if (!validation.valid) {
        const errorMessages = validation.errors.map((e) =>
          e.line ? `Line ${e.line}: ${e.message}` : e.message
        );
        logger.warn(`Validation failed:`, errorMessages);
        return {
          success: false,
          errors: errorMessages,
        };
      }

      const result: SubroutineCapture = {
        inputsSchema,
        outputsSchema,
        code,
        generatedInputs,
      };
      onCapture(result);
      logger.info(`Success - code captured`);
      return {
        success: true,
        message: "Subroutine generated successfully",
      };
    },
  };
};
