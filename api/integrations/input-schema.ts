/**
 * Input schema extraction utilities for integrations.
 *
 * Extracts JSON Schema input definitions for tools/operations from different integration types:
 * - MCP: Tool inputSchema
 * - GraphQL: Query/mutation arguments converted to JSON Schema
 * - OpenAPI: Operation parameters and request body converted to JSON Schema
 */

import {
  parse,
  type FieldDefinitionNode,
  type InputValueDefinitionNode,
  type TypeNode,
  type NamedTypeNode,
  type ListTypeNode,
  type NonNullTypeNode,
  Kind,
} from "graphql";
import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import { parseOpenAPISpec } from "./openapi-introspection";

// =============================================================================
// Types
// =============================================================================

export interface InputSchemaResult {
  ok: true;
  schema: Record<string, unknown>;
  description?: string;
}

export interface InputSchemaError {
  ok: false;
  error: string;
  code: "NOT_FOUND" | "INVALID_IDENTIFIER" | "PARSE_ERROR" | "UNSUPPORTED_TYPE";
}

export type GetInputSchemaResult = InputSchemaResult | InputSchemaError;

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export const getMcpToolInputSchema = (tools: McpTool[], toolName: string): GetInputSchemaResult => {
  const tool = tools.find((t) => t.name === toolName);

  if (!tool) {
    return {
      ok: false,
      error: `Tool "${toolName}" not found. Available tools: ${tools.map((t) => t.name).join(", ")}`,
      code: "NOT_FOUND",
    };
  }

  return {
    ok: true,
    schema: tool.inputSchema ?? { type: "object", properties: {} },
    description: tool.description,
  };
};

const graphqlScalarToJsonSchema = (typeName: string): Record<string, unknown> => {
  switch (typeName) {
    case "String":
    case "ID":
      return { type: "string" };
    case "Int":
      return { type: "integer" };
    case "Float":
      return { type: "number" };
    case "Boolean":
      return { type: "boolean" };
    default:
      // Custom scalars - treat as string
      return { type: "string" };
  }
};

const graphqlTypeToJsonSchema = (
  typeNode: TypeNode,
  schemaTypes: Map<string, Record<string, unknown>>
): { schema: Record<string, unknown>; required: boolean } => {
  if (typeNode.kind === Kind.NON_NULL_TYPE) {
    const inner = graphqlTypeToJsonSchema((typeNode as NonNullTypeNode).type, schemaTypes);
    return { schema: inner.schema, required: true };
  }

  if (typeNode.kind === Kind.LIST_TYPE) {
    const inner = graphqlTypeToJsonSchema((typeNode as ListTypeNode).type, schemaTypes);
    return {
      schema: { type: "array", items: inner.schema },
      required: false,
    };
  }

  const namedType = typeNode as NamedTypeNode;
  const typeName = namedType.name.value;

  if (["String", "Int", "Float", "Boolean", "ID"].includes(typeName)) {
    return { schema: graphqlScalarToJsonSchema(typeName), required: false };
  }

  const typeDef = schemaTypes.get(typeName);
  if (typeDef) {
    return { schema: typeDef, required: false };
  }

  return { schema: { type: "object" }, required: false };
};

const parseGraphQLSchema = (
  sdl: string
): {
  queryType: FieldDefinitionNode[] | null;
  mutationType: FieldDefinitionNode[] | null;
  inputTypes: Map<string, Record<string, unknown>>;
} => {
  const doc = parse(sdl);
  const inputTypes = new Map<string, Record<string, unknown>>();
  let queryType: FieldDefinitionNode[] | null = null;
  let mutationType: FieldDefinitionNode[] | null = null;

  for (const def of doc.definitions) {
    if (def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION) {
      // Parse input type
      const properties: Record<string, Record<string, unknown>> = {};
      const required: string[] = [];

      for (const field of def.fields ?? []) {
        const fieldResult = graphqlTypeToJsonSchema(field.type, inputTypes);
        properties[field.name.value] = fieldResult.schema;
        if (fieldResult.required) {
          required.push(field.name.value);
        }
      }

      inputTypes.set(def.name.value, {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      });
    } else if (def.kind === Kind.OBJECT_TYPE_DEFINITION) {
      if (def.name.value === "Query") {
        queryType = (def.fields ?? []) as FieldDefinitionNode[];
      } else if (def.name.value === "Mutation") {
        mutationType = (def.fields ?? []) as FieldDefinitionNode[];
      }
    } else if (def.kind === Kind.ENUM_TYPE_DEFINITION) {
      // Parse enum type
      const enumValues = (def.values ?? []).map((v) => v.name.value);
      inputTypes.set(def.name.value, {
        type: "string",
        enum: enumValues,
      });
    } else if (def.kind === Kind.SCALAR_TYPE_DEFINITION) {
      // Custom scalar - treat as string
      inputTypes.set(def.name.value, { type: "string" });
    }
  }

  return { queryType, mutationType, inputTypes };
};

const graphqlArgsToJsonSchema = (
  args: readonly InputValueDefinitionNode[],
  inputTypes: Map<string, Record<string, unknown>>
): Record<string, unknown> => {
  if (args.length === 0) {
    return { type: "object", properties: {} };
  }

  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const arg of args) {
    const argResult = graphqlTypeToJsonSchema(arg.type, inputTypes);
    properties[arg.name.value] = argResult.schema;
    if (argResult.required) {
      required.push(arg.name.value);
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
};

export const getGraphQLOperationInputSchema = (
  sdl: string,
  operationName: string
): GetInputSchemaResult => {
  try {
    const { queryType, mutationType, inputTypes } = parseGraphQLSchema(sdl);

    if (queryType) {
      const field = queryType.find((f) => f.name.value === operationName);
      if (field) {
        return {
          ok: true,
          schema: graphqlArgsToJsonSchema(field.arguments ?? [], inputTypes),
          description: field.description?.value,
        };
      }
    }

    if (mutationType) {
      const field = mutationType.find((f) => f.name.value === operationName);
      if (field) {
        return {
          ok: true,
          schema: graphqlArgsToJsonSchema(field.arguments ?? [], inputTypes),
          description: field.description?.value,
        };
      }
    }

    const availableOps: string[] = [];
    if (queryType) {
      availableOps.push(...queryType.map((f) => `Query.${f.name.value}`));
    }
    if (mutationType) {
      availableOps.push(...mutationType.map((f) => `Mutation.${f.name.value}`));
    }

    return {
      ok: false,
      error: `Operation "${operationName}" not found. Available operations: ${availableOps.slice(0, 10).join(", ")}${availableOps.length > 10 ? "..." : ""}`,
      code: "NOT_FOUND",
    };
  } catch (error) {
    return {
      ok: false,
      error: `Failed to parse GraphQL schema: ${error instanceof Error ? error.message : String(error)}`,
      code: "PARSE_ERROR",
    };
  }
};

type OpenAPIDocument = OpenAPIV3.Document | OpenAPIV3_1.Document;
type OpenAPIOperation = OpenAPIV3.OperationObject | OpenAPIV3_1.OperationObject;
type OpenAPIParameter = OpenAPIV3.ParameterObject | OpenAPIV3_1.ParameterObject;
type OpenAPIRequestBody = OpenAPIV3.RequestBodyObject | OpenAPIV3_1.RequestBodyObject;
type OpenAPISchema = OpenAPIV3.SchemaObject | OpenAPIV3_1.SchemaObject;

/**
 * Extract JSON Schema from an OpenAPI parameter.
 * Assumes the spec has been dereferenced (no $ref pointers).
 */
const openApiParamToJsonSchema = (param: OpenAPIParameter): Record<string, unknown> => {
  if ("schema" in param && param.schema) {
    return param.schema as Record<string, unknown>;
  }
  // Default to string for parameters without explicit schema
  return { type: "string" };
};

/**
 * Extract input schema from a dereferenced OpenAPI spec for a specific operation.
 * This is the internal implementation that works on an already-parsed spec.
 */
const extractOpenAPIOperationInputSchema = (
  spec: OpenAPIDocument,
  method: string,
  path: string
): GetInputSchemaResult => {
  const normalizedMethod = method.toLowerCase();

  // Find the operation
  const pathItem = spec.paths?.[path];
  if (!pathItem) {
    const availablePaths = Object.keys(spec.paths ?? {}).slice(0, 10);
    return {
      ok: false,
      error: `Path "${path}" not found. Available paths: ${availablePaths.join(", ")}${Object.keys(spec.paths ?? {}).length > 10 ? "..." : ""}`,
      code: "NOT_FOUND",
    };
  }

  const operation = (pathItem as Record<string, unknown>)[normalizedMethod] as
    | OpenAPIOperation
    | undefined;
  if (!operation) {
    const availableMethods = ["get", "post", "put", "patch", "delete", "head", "options"]
      .filter((m) => m in (pathItem as Record<string, unknown>))
      .map((m) => m.toUpperCase());
    return {
      ok: false,
      error: `Method "${method}" not found for path "${path}". Available methods: ${availableMethods.join(", ")}`,
      code: "NOT_FOUND",
    };
  }

  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  const pathParams = (pathItem as { parameters?: OpenAPIParameter[] }).parameters ?? [];
  const operationParams = operation.parameters ?? [];
  const params = [...pathParams, ...operationParams] as OpenAPIParameter[];

  for (const param of params) {
    const paramSchema = openApiParamToJsonSchema(param);
    const paramName = param.name;

    // Add location hint to description
    const description = param.description
      ? `[${param.in}] ${param.description}`
      : `[${param.in}] parameter`;

    properties[paramName] = {
      ...paramSchema,
      description,
    };

    if (param.required) {
      required.push(paramName);
    }
  }

  if (operation.requestBody) {
    const requestBody = operation.requestBody as OpenAPIRequestBody;
    const jsonContent = requestBody.content?.["application/json"];

    if (jsonContent?.schema) {
      const bodySchema = jsonContent.schema as OpenAPISchema;

      // If the body is an object, merge its properties
      if (bodySchema.type === "object" && bodySchema.properties) {
        for (const [propName, propSchema] of Object.entries(bodySchema.properties)) {
          properties[propName] = {
            ...(propSchema as Record<string, unknown>),
            description:
              `[body] ${(propSchema as Record<string, unknown>).description ?? ""}`.trim(),
          };
        }

        // Add body required fields
        if (bodySchema.required && requestBody.required) {
          required.push(...bodySchema.required);
        }
      } else {
        // Non-object body - add as "body" property
        properties["body"] = {
          ...bodySchema,
          description: "[body] Request body",
        };
        if (requestBody.required) {
          required.push("body");
        }
      }
    }
  }

  return {
    ok: true,
    schema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
    description: operation.summary ?? operation.description,
  };
};

export const getOpenAPIOperationInputSchema = async (
  specJson: string,
  method: string,
  path: string
): Promise<GetInputSchemaResult> => {
  const parseResult = await parseOpenAPISpec(specJson);

  if (!parseResult.ok) {
    return {
      ok: false,
      error: parseResult.error.message,
      code: "PARSE_ERROR",
    };
  }

  // Parse the dereferenced spec (it's stored as JSON string)
  const spec = JSON.parse(parseResult.result.spec) as OpenAPIDocument;

  return extractOpenAPIOperationInputSchema(spec, method, path);
};

// =============================================================================
// High-Level API
// =============================================================================

import { getIntegrationOrGlobal } from "../models/integration";

export interface GetIntegrationInputSchemaOptions {
  integrationId: string;
  organizationId: string;

  /**
   * Identifiers for the tool/operation:
   * - MCP: [toolName] - 1 identifier
   * - GraphQL: [operationName] - 1 identifier (query or mutation field name)
   * - OpenAPI: [method, path] - 2 identifiers
   */
  identifiers: string[];
}

export const getIntegrationInputSchema = async (
  options: GetIntegrationInputSchemaOptions
): Promise<GetInputSchemaResult> => {
  const { integrationId, organizationId, identifiers } = options;

  const integration = await getIntegrationOrGlobal(integrationId, organizationId);
  if (!integration) {
    return {
      ok: false,
      error: "Integration not found",
      code: "NOT_FOUND",
    };
  }

  const configType = integration.authConfig.type;

  if (configType === "mcp") {
    // MCP: 1 identifier (tool name)
    if (identifiers.length !== 1) {
      return {
        ok: false,
        error: "MCP integrations require exactly 1 identifier: [toolName]",
        code: "INVALID_IDENTIFIER",
      };
    }

    const config = integration.authConfig;
    if (!config.tools) {
      return {
        ok: false,
        error: "MCP integration has no tools cached. Introspect the tools first.",
        code: "NOT_FOUND",
      };
    }

    const [toolName] = identifiers;
    return getMcpToolInputSchema(config.tools, toolName);
  }

  if (configType === "graphql") {
    // GraphQL: 1 identifier (operation name)
    if (identifiers.length !== 1) {
      return {
        ok: false,
        error: "GraphQL integrations require exactly 1 identifier: [operationName]",
        code: "INVALID_IDENTIFIER",
      };
    }

    const config = integration.authConfig;
    if (!config.schema) {
      return {
        ok: false,
        error: "GraphQL integration has no schema cached. Introspect the schema first.",
        code: "NOT_FOUND",
      };
    }

    const [operationName] = identifiers;
    return getGraphQLOperationInputSchema(config.schema, operationName);
  }

  if (configType === "openapi") {
    // OpenAPI: 2 identifiers (method, path)
    if (identifiers.length !== 2) {
      return {
        ok: false,
        error: "OpenAPI integrations require exactly 2 identifiers: [method, path]",
        code: "INVALID_IDENTIFIER",
      };
    }

    const config = integration.authConfig;
    if (!config.spec) {
      return {
        ok: false,
        error: "OpenAPI integration has no spec cached. Fetch or upload the spec first.",
        code: "NOT_FOUND",
      };
    }

    const [method, path] = identifiers;
    return await getOpenAPIOperationInputSchema(config.spec, method, path);
  }

  return {
    ok: false,
    error: `Integration type "${configType}" does not support input schema extraction`,
    code: "UNSUPPORTED_TYPE",
  };
};
