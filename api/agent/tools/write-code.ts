import {
  type CompletedConfig,
  type Config,
  createFormatter,
  createParser,
  SchemaGenerator,
} from "ts-json-schema-generator";
import { Project } from "ts-morph";
import ts from "typescript";
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

const filterSchema = (k: any, v: any) => (k === "$schema" ? undefined : v);

const DEFAULT_FILE_NAME = "source.ts";

const logger = getLogger("api/agent/tools/write-code.ts", "info");

// 1. Compiler options (minimal example)
const compilerOptions: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
};

type GenerateSubroutineOptions = {
  disableExecution?: boolean;
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
  onCapture: (result: SubroutineCapture) => Promise<void>,
  options?: GenerateSubroutineOptions
) => {
  const baseToolSchema = z.object({
    code: z
      .string()
      .describe("The TypeScript code that exports an async main function with proper types"),
  });

  const toolSchema = baseToolSchema;

  return {
    description: "Submit a generated TypeScript function with input and output schemas",
    inputSchema: toolSchema,
    execute: async (params: z.infer<typeof toolSchema>) => {
      try {
        logger.debug(`Code length: ${params.code.length} chars`);
        const { code } = params;

        const validationContext = await buildValidationContext(options);
        logger.debug(
          `Validating code (${code.length} chars) with context: ${JSON.stringify(validationContext)}`
        );
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

        // 2. In-memory compiler host
        const host = ts.createCompilerHost(compilerOptions);

        // load the source of this file into a new ts-morph project and delete everything besides the inputs and outputs types
        const project = new Project({
          useInMemoryFileSystem: true,
          compilerOptions: {
            strict: true,
            skipLibCheck: true,
          },
        });
        const sourceFile = project.createSourceFile(DEFAULT_FILE_NAME, code);
        const inputsTypeAlias = sourceFile.getTypeAlias("Inputs");
        const inputsInterface = sourceFile.getInterface("Inputs");
        const inputsClass = sourceFile.getClass("Inputs");
        const outputsTypeAlias = sourceFile.getTypeAlias("Outputs");
        const outputsInterface = sourceFile.getInterface("Outputs");
        const outputsClass = sourceFile.getClass("Outputs");
        // rewrite sourceFile to just have the above nodes
        const typesFile = project.createSourceFile(`${DEFAULT_FILE_NAME}.types.ts`, "", {
          overwrite: true,
        });

        // re-add as *structures*
        if (inputsTypeAlias)
          typesFile.addTypeAlias({ ...inputsTypeAlias.getStructure(), isExported: true });

        if (inputsInterface)
          typesFile.addInterface({ ...inputsInterface.getStructure(), isExported: true });

        if (inputsClass) typesFile.addClass({ ...inputsClass.getStructure(), isExported: true });

        if (outputsTypeAlias)
          typesFile.addTypeAlias({ ...outputsTypeAlias.getStructure(), isExported: true });

        if (outputsInterface)
          typesFile.addInterface({ ...outputsInterface.getStructure(), isExported: true });

        if (outputsClass) typesFile.addClass({ ...outputsClass.getStructure(), isExported: true });
        // convert the typesFile to a string
        const typesCode = typesFile.getFullText();
        typesFile.delete();
        sourceFile.delete();

        // Override the FS-related methods
        host.readFile = (path) => (path === DEFAULT_FILE_NAME ? typesCode : undefined);
        host.fileExists = (path) => path === DEFAULT_FILE_NAME;
        host.getSourceFile = (path, languageVersion) => {
          if (path !== DEFAULT_FILE_NAME) return undefined;
          return ts.createSourceFile(path, typesCode, languageVersion, true);
        };

        // 3. Create a Program from the virtual file
        const program = ts.createProgram([DEFAULT_FILE_NAME], compilerOptions, host);
        // 4. Wire it into ts-json-schema-generator
        const config: Config = {
          path: DEFAULT_FILE_NAME, // just used for internal filtering, name must match
          tsconfig: undefined, // not needed, we already have a Program
          type: "*", // we'll ask for specific types below
          expose: "export",
          jsDoc: "extended",
        };

        // Use the low-level API instead of createGenerator(config)
        const parser = createParser(program, config as unknown as CompletedConfig);
        const formatter = createFormatter(config as unknown as CompletedConfig);
        const generator = new SchemaGenerator(program, parser, formatter, config);

        const inputsSchema = generator.createSchema("Inputs");
        const outputsSchema = generator.createSchema("Outputs");

        logger.debug(`Generated code: ${code}`);
        const result: SubroutineCapture = {
          code,
          inputsSchema: JSON.parse(JSON.stringify(inputsSchema, filterSchema)),
          outputsSchema: JSON.parse(JSON.stringify(outputsSchema, filterSchema)),
        };
        await onCapture(result);
        logger.debug(`Success - code captured`);
        return {
          success: true,
          message: "Subroutine generated successfully",
        };
      } catch (error) {
        logger.error(`Failed to generate code: ${error}`);
        return {
          success: false,
          message: `Failed to generate code: ${error}`,
        };
      }
    },
  };
};
